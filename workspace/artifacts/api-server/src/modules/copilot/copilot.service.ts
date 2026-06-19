import { copilotSkillsTable, db } from "@workspace/db";
import { and, eq, isNull, or } from "drizzle-orm";
import { composeCopilotAnswer } from "./copilot.compose.js";
import { resolveCopilotIntent } from "./copilot.intent-resolve.js";
import { autoProposeAliasCandidates } from "./copilot.alias-suggest.js";
import { buildCopilotNluToolRun } from "./copilot.nlu.js";
import {
  appendCopilotMessage,
  buildMessageMetadata,
  getOrCreateCopilotSession,
  persistToolRuns,
} from "./copilot.repository.js";
import { resolveCopilotCompanyScope } from "./copilot.scope.js";
import { buildCopilotQueryPlan } from "./copilot.planner.js";
import { evidenceSourcesFromRuns, executeCopilotQueryPlan, peerAggregatesFromPayload } from "./copilot.tool-executor.js";
import { listCopilotSkills } from "./skills/registry.js";
import type {
  CopilotAskRequest,
  CopilotAskResponse,
  CopilotEvidence,
  CopilotQueryPlanResponse,
  CopilotResponseMode,
  CopilotSkillSummary,
} from "./copilot.types.js";

function toScopeSummary(scope: Awaited<ReturnType<typeof resolveCopilotCompanyScope>>) {
  return {
    kind: scope.kind,
    label: scope.label,
    tenantId: scope.tenantId,
    deviceCount: scope.deviceIds.length,
    deviceHostnames: scope.deviceHostnames,
  };
}

function emptyEvidence(intent: CopilotAskResponse["intent"]): CopilotEvidence {
  return {
    intent,
    entities: [],
    resolvedEntities: [],
    scope: { kind: "site", label: "—", tenantId: null, deviceCount: 0, deviceHostnames: [] },
    queryPlan: { intent, tools: [], skills: [] },
    skillsUsed: [],
    toolRuns: [],
    sources: [],
    peers: [],
    peerAggregates: [],
    announcements: [],
    circuits: [],
    complianceFindings: [],
    l2Findings: [],
    configHints: [],
    routePolicies: [],
    prefixTraces: [],
    routePolicyExplains: [],
    historyEvents: [],
    matrixTimelapse: [],
    drilldownCompares: [],
    diagnosticTrail: [],
    netboxMatches: [],
    netboxSummary: null,
    nlu: {
      used: false,
      provider: "none",
      model: null,
      confidence: null,
      intentOverride: false,
      ambiguous: false,
    },
    notes: [],
  };
}

function normalizeMode(mode?: CopilotResponseMode): CopilotResponseMode {
  if (mode === "quick" || mode === "diagnostic" || mode === "action" || mode === "technical") {
    return mode;
  }
  return "technical";
}

export async function getCopilotSkillCatalog(tenantId?: number | null): Promise<CopilotSkillSummary[]> {
  const dbSkills = await db
    .select()
    .from(copilotSkillsTable)
    .where(and(
      eq(copilotSkillsTable.enabled, true),
      tenantId == null
        ? isNull(copilotSkillsTable.tenantId)
        : or(isNull(copilotSkillsTable.tenantId), eq(copilotSkillsTable.tenantId, tenantId)),
    ));

  const fromDb = dbSkills.map((skill) => ({
    id: skill.skillKey,
    name: skill.name,
    description: skill.description ?? "",
    intents: [] as CopilotSkillSummary["intents"],
  }));

  if (fromDb.length > 0) return fromDb;

  return listCopilotSkills().map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    intents: skill.intents,
  }));
}

export async function planCopilotQuery(input: CopilotAskRequest): Promise<CopilotQueryPlanResponse> {
  const question = input.question.trim();
  const parsed = await resolveCopilotIntent(question);
  const scope = await resolveCopilotCompanyScope({
    deviceId: input.deviceId,
    siteFilter: parsed.entities.find((entity) => entity.kind === "site")?.value,
  });

  const plan = await buildCopilotQueryPlan({
    question,
    intent: parsed.intent,
    entities: parsed.entities,
    scope,
  });

  return {
    question,
    plan: {
      intent: plan.intent,
      tools: plan.tools,
      skills: plan.skills,
      scope: toScopeSummary(scope),
      entities: parsed.entities,
    },
    readOnly: true,
    generatedAt: new Date().toISOString(),
  };
}

async function runCopilotCore(input: CopilotAskRequest): Promise<{
  question: string;
  parsed: Awaited<ReturnType<typeof resolveCopilotIntent>>;
  scope: Awaited<ReturnType<typeof resolveCopilotCompanyScope>>;
  execution: Awaited<ReturnType<typeof executeCopilotQueryPlan>>;
  mode: CopilotResponseMode;
}> {
  const question = input.question.trim();
  const parsed = await resolveCopilotIntent(question);
  const scope = await resolveCopilotCompanyScope({
    deviceId: input.deviceId,
    siteFilter: parsed.entities.find((entity) => entity.kind === "site")?.value,
  });
  const execution = await executeCopilotQueryPlan({
    question,
    intent: parsed.intent,
    entities: parsed.entities,
    scope,
  });
  return { question, parsed, scope, execution, mode: normalizeMode(input.mode) };
}

function buildEvidenceFromExecution(
  parsed: Awaited<ReturnType<typeof resolveCopilotIntent>>,
  scope: Awaited<ReturnType<typeof resolveCopilotCompanyScope>>,
  execution: Awaited<ReturnType<typeof executeCopilotQueryPlan>>,
): CopilotEvidence {
  const notes = [...(execution.payload.notes ?? [])];

  if (parsed.nlu.used) {
    notes.push(`Intent refinada por NLU local (${parsed.nlu.model}, conf=${parsed.nlu.confidence?.toFixed(2) ?? "?"}).`);
  } else if (parsed.nlu.ambiguous && !parsed.nlu.error) {
    notes.push("Pergunta ambigua — NLU desabilitado, usando classificacao regex.");
  }

  if (parsed.intent === "bgp_peering_status" && (execution.payload.peers?.length ?? 0) === 0) {
    notes.push("Dica: peers CDN costumam estar na VRF `CDN`. Coleta SNMP recente e necessaria.");
  }
  if (parsed.intent === "bgp_announcements" && (execution.payload.announcements?.length ?? 0) === 0) {
    notes.push("Matriz de anuncios sem correspondencia — valide discovery/config bundle.");
  }
  if (scope.deviceIds.length > 1) {
    notes.push(`Agregacao em ${scope.deviceIds.length} devices (${scope.label}) — isolado por tenant.`);
  }

  return {
    intent: parsed.intent,
    entities: parsed.entities,
    resolvedEntities: (execution.payload.resolvedEntities ?? []).map((item) => ({
      canonicalName: item.canonicalName,
      entityType: item.entityType,
      asn: item.asn,
      matchedAliases: item.matchedAliases,
      confidence: item.confidence,
    })),
    scope: toScopeSummary(scope),
    queryPlan: {
      intent: execution.plan.intent,
      tools: execution.plan.tools,
      skills: execution.plan.skills,
    },
    skillsUsed: execution.plan.skills,
    toolRuns: execution.toolRuns.map((run) => ({
      toolName: run.toolName,
      status: run.status,
      durationMs: run.durationMs,
      sourceType: run.source?.type ?? null,
      sourceRef: run.source?.ref ?? null,
      error: run.error,
    })),
    sources: evidenceSourcesFromRuns(execution.toolRuns),
    peers: execution.payload.peers ?? [],
    peerAggregates: peerAggregatesFromPayload(execution.payload),
    announcements: execution.payload.announcements ?? [],
    circuits: execution.payload.circuits ?? [],
    complianceFindings: execution.payload.complianceFindings ?? [],
    l2Findings: execution.payload.l2Findings ?? [],
    configHints: execution.payload.configHints ?? [],
    routePolicies: execution.payload.routePolicies ?? [],
    prefixTraces: execution.payload.prefixTraces ?? [],
    routePolicyExplains: execution.payload.routePolicyExplains ?? [],
    historyEvents: execution.payload.historyEvents ?? [],
    matrixTimelapse: execution.payload.matrixTimelapse ?? [],
    drilldownCompares: execution.payload.drilldownCompares ?? [],
    diagnosticTrail: execution.payload.diagnosticTrail ?? [],
    netboxMatches: execution.payload.netboxMatches ?? [],
    netboxSummary: execution.payload.netboxSummary ?? null,
    nlu: parsed.nlu,
    notes: [...new Set(notes)],
  };
}

export async function askCopilot(input: CopilotAskRequest): Promise<CopilotAskResponse> {
  const mode = normalizeMode(input.mode);

  if (!input.question.trim()) {
    return {
      question: input.question,
      intent: "help",
      mode,
      answer: "Envie uma pergunta sobre peering BGP, anuncios, circuitos L2 ou dicas de configuracao.",
      confidence: "low",
      evidence: emptyEvidence("help"),
      readOnly: true,
      generatedAt: new Date().toISOString(),
    };
  }

  const { question, parsed, scope, execution } = await runCopilotCore(input);

  if (scope.deviceIds.length === 0) {
    return {
      question,
      intent: parsed.intent,
      mode,
      answer: "Nenhum device ativo no escopo da empresa. Cadastre devices ou selecione um anchor.",
      confidence: "low",
      evidence: {
        ...emptyEvidence(parsed.intent),
        entities: parsed.entities,
        scope: toScopeSummary(scope),
        nlu: parsed.nlu,
      },
      readOnly: true,
      generatedAt: new Date().toISOString(),
    };
  }

  const evidence = buildEvidenceFromExecution(parsed, scope, execution);
  const { answer, confidence } = composeCopilotAnswer(parsed.intent, evidence, mode);

  if (confidence === "low" && scope.tenantId != null && input.userId) {
    const suggestion = await autoProposeAliasCandidates({
      tenantId: scope.tenantId,
      question,
      resolvedEntities: evidence.resolvedEntities.map((item) => ({
        canonicalName: item.canonicalName,
        entityType: item.entityType,
        asn: item.asn,
        matchedAliases: item.matchedAliases,
        confidence: item.confidence,
        vrf: null,
      })),
      createdBy: input.userId,
      source: "low_confidence",
    });
    if (suggestion.proposed > 0) {
      evidence.notes.push(`Alias candidatos propostos (${suggestion.proposed}): ${suggestion.candidates.join(", ")} — aguardam aprovacao admin.`);
    }
  }

  let sessionId: number | undefined;
  let messageId: number | undefined;

  if (input.userId && scope.tenantId != null) {
    const session = await getOrCreateCopilotSession({
      sessionId: input.sessionId,
      tenantId: scope.tenantId,
      userId: input.userId,
      anchorDeviceId: input.deviceId,
      title: question.slice(0, 120),
    });
    sessionId = session.id;

    await appendCopilotMessage({
      sessionId: session.id,
      role: "user",
      content: question,
    });

    const assistantMessage = await appendCopilotMessage({
      sessionId: session.id,
      role: "assistant",
      content: answer,
      metadata: buildMessageMetadata({ intent: parsed.intent, confidence, evidence }),
    });
    messageId = assistantMessage.id;

    await persistToolRuns({
      sessionId: session.id,
      messageId: assistantMessage.id,
      toolRuns: execution.toolRuns,
    });
  }

  return {
    question,
    intent: parsed.intent,
    mode,
    answer,
    confidence,
    evidence,
    sessionId,
    messageId,
    readOnly: true,
    generatedAt: new Date().toISOString(),
  };
}

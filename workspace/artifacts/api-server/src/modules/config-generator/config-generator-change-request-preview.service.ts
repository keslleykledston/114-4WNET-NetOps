import { eq } from "drizzle-orm";
import {
  configGeneratorArtifactsTable,
  configGeneratorTemplateVersionsTable,
  configGeneratorTemplatesTable,
  db,
  devicesTable,
} from "@workspace/db";
import { getConfigGeneratorRunDiff } from "./config-generator-diff.service.js";
import { suggestNextId } from "./config-generator-id-allocator.service.js";
import {
  checksumJson,
  CONFIG_GENERATOR_SECRET_PLACEHOLDER,
  sanitizeConfigGeneratorValidationSummaryForStorage,
  sanitizeRenderedConfig,
} from "./config-generator.engine.js";
import { getConfigGeneratorRun, getConfigGeneratorRunArtifacts } from "./config-generator.service.js";
import type {
  ConfigGeneratorChangeRequestPreview,
  ConfigGeneratorChangeRequestPreviewRiskLevel,
  ConfigGeneratorDiffResponse,
  ConfigGeneratorFieldOrigins,
  ConfigGeneratorRiskAssessmentFactor,
  ConfigGeneratorValidationFinding,
  ConfigGeneratorValidationSummary,
} from "./config-generator.types.js";

const SUGGESTED_ORIGINS = new Set(["id_allocator", "device_context", "inventory", "bgp_peer", "l2_circuit", "service_catalog", "announcement_matrix", "discovery"]);

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function latestArtifactContent(artifacts: Array<{ artifactType: string; content: string }>, type: string): string | null {
  const matches = artifacts.filter((row) => row.artifactType === type);
  return matches.length > 0 ? matches[matches.length - 1].content : null;
}

function parseDiffArtifact(artifacts: Array<{ artifactType: string; content: string }>): ConfigGeneratorDiffResponse | null {
  const raw = latestArtifactContent(artifacts, "precheck_diff") ?? latestArtifactContent(artifacts, "semantic_diff");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ConfigGeneratorDiffResponse;
  } catch {
    return null;
  }
}

function splitValidation(summary: ConfigGeneratorValidationSummary) {
  const sanitized = sanitizeConfigGeneratorValidationSummaryForStorage(summary);
  return {
    errors: sanitized.errors,
    warnings: sanitized.warnings,
    infos: sanitized.warnings.filter((item) => item.code.endsWith("_normalized") || item.code === "circuit_name_normalized"),
  };
}

function buildFieldOriginLists(fieldOrigins: ConfigGeneratorFieldOrigins) {
  const manualFields: string[] = [];
  const suggestedFields: string[] = [];
  for (const [key, origin] of Object.entries(fieldOrigins)) {
    if (origin === "manual") manualFields.push(key);
    else if (origin && SUGGESTED_ORIGINS.has(origin)) suggestedFields.push(key);
  }
  return { manualFields, suggestedFields };
}

function buildScope(input: Record<string, unknown>, run: NonNullable<Awaited<ReturnType<typeof getConfigGeneratorRun>>>, deviceName: string, site: string | null) {
  const interfaces = new Set<string>();
  const bgpPeers = new Set<string>();
  const vlans = new Set<number>();
  const l2vcIds = new Set<number>();
  const vsiIds = new Set<number>();

  const iface = text(input.interface) ?? text(input.parentInterface);
  if (iface) interfaces.add(iface);

  const peerV4 = text(input.peerRemoteIpv4) ?? text(input.remotePeerIp);
  const peerV6 = text(input.peerRemoteIpv6);
  if (peerV4) bgpPeers.add(peerV4);
  if (peerV6) bgpPeers.add(peerV6);
  if (Array.isArray(input.remotePeers)) {
    for (const peer of input.remotePeers) {
      const value = text(peer);
      if (value) bgpPeers.add(value);
    }
  }

  const vlan = num(input.vlan);
  const subif = num(input.subinterfaceId);
  const l2vc = num(input.l2vcId);
  const vsi = num(input.vsiId);
  if (vlan != null) vlans.add(vlan);
  if (subif != null) vlans.add(subif);
  if (l2vc != null) l2vcIds.add(l2vc);
  if (vsi != null) vsiIds.add(vsi);

  return {
    tenant: run.tenantName ?? String(run.tenantId),
    site,
    device: deviceName,
    interfaces: [...interfaces],
    bgpPeers: [...bgpPeers],
    vlans: [...vlans].sort((a, b) => a - b),
    l2vcIds: [...l2vcIds].sort((a, b) => a - b),
    vsiIds: [...vsiIds].sort((a, b) => a - b),
  };
}

function factor(
  code: string,
  severity: ConfigGeneratorChangeRequestPreviewRiskLevel,
  message: string,
  context?: Record<string, unknown>,
): ConfigGeneratorRiskAssessmentFactor {
  return { code, severity, message, ...(context ? { context } : {}) };
}

function severityRank(level: ConfigGeneratorChangeRequestPreviewRiskLevel): number {
  if (level === "blocked") return 4;
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

function maxRisk(levels: ConfigGeneratorChangeRequestPreviewRiskLevel[]): ConfigGeneratorChangeRequestPreviewRiskLevel {
  return levels.reduce((max, current) => (severityRank(current) > severityRank(max) ? current : max), "low");
}

function assessRisk(input: {
  validation: ConfigGeneratorValidationSummary;
  diff: ConfigGeneratorDiffResponse | null;
  idConflicts: ConfigGeneratorValidationFinding[];
  baselineMissing: boolean;
}): { riskLevel: ConfigGeneratorChangeRequestPreviewRiskLevel; score: number; factors: ConfigGeneratorRiskAssessmentFactor[] } {
  const factors: ConfigGeneratorRiskAssessmentFactor[] = [];

  const BLOCKED_ERROR_CODES = new Set(["missing_required_field", "invalid_vlan", "vlan_blocked", "invalid_local_asn", "invalid_remote_asn", "invalid_peer_local_ipv4", "invalid_peer_remote_ipv4", "invalid_peer_local_ipv6", "invalid_peer_remote_ipv6", "invalid_circuit_name", "invalid_prefix", "bogon_prefix"]);
  const HIGH_ERROR_CODES = new Set(["route_policy_conflict", "vlan_conflict", "peer_remote_ip_exists", "id_occupied", "prefix_conflict", "circuit_conflict", "community_conflict", "l2vc_conflict", "vsi_conflict", "subinterface_conflict"]);

  for (const error of input.validation.errors) {
    if (error.severity !== "error") continue;
    if (BLOCKED_ERROR_CODES.has(error.code)) {
      factors.push(factor(error.code, "blocked", error.message, error.context));
    } else if (HIGH_ERROR_CODES.has(error.code)) {
      factors.push(factor(error.code, "high", error.message, error.context));
    } else {
      factors.push(factor(error.code, "blocked", error.message, error.context));
    }
  }

  if (input.diff?.blocking) {
    factors.push(factor("diff_conflict", "blocked", "Diff/precheck reporta conflito bloqueante.", { conflicts: input.diff.summary.conflicts }));
  }

  for (const conflict of input.idConflicts) {
    factors.push(factor(conflict.code, "high", conflict.message, conflict.context));
  }

  for (const warning of input.validation.warnings) {
    if (warning.code === "vlan_outside_preferred_range") {
      factors.push(factor(warning.code, "medium", warning.message, warning.context));
    }
    if (warning.code === "global_dependency_missing") {
      factors.push(factor(warning.code, "medium", warning.message, warning.context));
    }
    if (warning.code === "interface_down" || warning.code === "mtu_divergent") {
      factors.push(factor(warning.code, "medium", warning.message, warning.context));
    }
    if (warning.code === "ptp_multiple_peers" || warning.code === "ptmp_single_peer") {
      factors.push(factor(warning.code, "medium", warning.message, warning.context));
    }
    if (warning.code === "empty_prefixes") {
      factors.push(factor(warning.code, "medium", warning.message, warning.context));
    }
  }

  if (input.baselineMissing) {
    factors.push(factor("baseline_missing", "high", "Baseline ausente para o device — revisão manual necessária."));
  }

  if (input.diff) {
    if (input.diff.summary.manualReview > 0) {
      factors.push(factor("diff_partial_match", "medium", "Diff contém itens para revisão manual.", {
        manualReview: input.diff.summary.manualReview,
      }));
    }
    if (input.diff.summary.globalMissing > 0) {
      factors.push(factor("global_dependency_missing", "medium", "Dependências globais ausentes no baseline.", {
        count: input.diff.summary.globalMissing,
      }));
    }
    if (input.diff.summary.conflicts > 0 && !input.diff.blocking) {
      factors.push(factor("diff_conflict", "high", "Diff reporta conflitos semânticos.", { count: input.diff.summary.conflicts }));
    }
  }

  const uniqueFactors = [...new Map(factors.map((item) => [item.code + item.message, item])).values()];
  const riskLevel = maxRisk(uniqueFactors.map((item) => item.severity));
  const score = uniqueFactors.reduce((sum, item) => {
    if (item.severity === "blocked") return sum + 100;
    if (item.severity === "high") return sum + 75;
    if (item.severity === "medium") return sum + 50;
    return sum + 10;
  }, 0);

  return { riskLevel: uniqueFactors.length === 0 ? "low" : riskLevel, score, factors: uniqueFactors };
}

function buildTicketMarkdown(preview: Pick<ConfigGeneratorChangeRequestPreview, "summary" | "scope" | "deviceId" | "serviceType" | "templateKey" | "riskLevel" | "validations" | "riskAssessment" | "diff" | "candidateConfig" | "postcheckCommands" | "rollbackPlan" | "inputs" | "runId" | "generatedAt">): string {
  const lines = [
    `# ${preview.summary.title}`,
    "",
    "## Objetivo",
    preview.summary.description,
    "",
    "## Escopo",
    `- Tenant: ${preview.scope.tenant}`,
    `- Site: ${preview.scope.site ?? "n/a"}`,
    `- Device: ${preview.scope.device} (${preview.deviceId})`,
    `- Vendor/Platform: ${preview.summary.vendor} / ${preview.summary.platform}`,
    `- Serviço: ${preview.serviceType}`,
    `- Template: ${preview.templateKey}`,
    `- Cliente: ${preview.summary.customerName ?? "n/a"}`,
    `- Circuito: ${preview.summary.circuitId ?? "n/a"}`,
    "",
    "## IDs",
    `- VLANs: ${preview.scope.vlans.length > 0 ? preview.scope.vlans.join(", ") : "n/a"}`,
    `- L2VC: ${preview.scope.l2vcIds.length > 0 ? preview.scope.l2vcIds.join(", ") : "n/a"}`,
    `- VSI: ${preview.scope.vsiIds.length > 0 ? preview.scope.vsiIds.join(", ") : "n/a"}`,
    `- Origens manuais: ${preview.inputs.manualFields.length > 0 ? preview.inputs.manualFields.join(", ") : "nenhuma"}`,
    `- Origens sugeridas: ${preview.inputs.suggestedFields.length > 0 ? preview.inputs.suggestedFields.join(", ") : "nenhuma"}`,
    "",
    "## Validações",
    `- Erros: ${preview.validations.errors.length}`,
    `- Warnings: ${preview.validations.warnings.length}`,
    ...preview.validations.errors.map((item) => `- ERROR ${item.code}: ${item.message}`),
    ...preview.validations.warnings.map((item) => `- WARN ${item.code}: ${item.message}`),
    "",
    "## Risco",
    `- Nível: **${preview.riskLevel}** (score ${preview.riskAssessment.score})`,
    ...preview.riskAssessment.factors.map((item) => `- [${item.severity}] ${item.code}: ${item.message}`),
    "",
    "## Diff / Precheck",
    `- Baseline: ${preview.diff.baseline.source}`,
    `- Blocking: ${preview.diff.blocking ? "sim" : "não"}`,
    `- New candidate: ${preview.diff.summary.newCandidate}`,
    `- Conflicts: ${preview.diff.summary.conflicts}`,
    `- Global missing: ${preview.diff.summary.globalMissing}`,
    "",
    "## Script candidato",
    "```",
    preview.candidateConfig,
    "```",
    "",
    "## Postcheck",
    "```",
    preview.postcheckCommands,
    "```",
    "",
    "## Rollback (manual)",
    preview.rollbackPlan.notes.map((note) => `- ${note}`).join("\n"),
    "",
    "```",
    preview.rollbackPlan.content,
    "```",
    "",
    "## Observações",
    "- Nenhum comando foi executado pelo sistema.",
    "- Secrets não foram persistidos.",
    "- Rollback deve ser validado por humano.",
    "- Objetos globais não devem ser removidos.",
    "",
    `_Gerado em ${preview.generatedAt} — run #${preview.runId}_`,
  ];
  return lines.join("\n");
}

function ensureNoSecrets(content: string): string {
  if (content.includes(CONFIG_GENERATOR_SECRET_PLACEHOLDER)) return content;
  return sanitizeRenderedConfig(content);
}

async function loadTemplateKey(templateVersionId: number): Promise<string> {
  const [row] = await db
    .select({ templateKey: configGeneratorTemplatesTable.templateKey })
    .from(configGeneratorTemplatesTable)
    .innerJoin(configGeneratorTemplateVersionsTable, eq(configGeneratorTemplateVersionsTable.templateId, configGeneratorTemplatesTable.id))
    .where(eq(configGeneratorTemplateVersionsTable.id, templateVersionId))
    .limit(1);
  return row?.templateKey ?? "unknown";
}

export async function buildChangeRequestPreview(runId: number, actorId?: number | null): Promise<ConfigGeneratorChangeRequestPreview> {
  const run = await getConfigGeneratorRun(runId);
  if (!run) throw new Error("RUN_NOT_FOUND");

  const [device] = await db
    .select({
      hostname: devicesTable.hostname,
      vendor: devicesTable.vendor,
      platform: devicesTable.platform,
      site: devicesTable.site,
    })
    .from(devicesTable)
    .where(eq(devicesTable.id, run.deviceId))
    .limit(1);

  const templateKey = await loadTemplateKey(run.templateVersionId);
  const input = run.inputJson ?? {};
  const fieldOrigins = run.fieldOrigins ?? {};
  const validation = run.validationSummary ?? { status: "passed", warnings: [], errors: [] };
  const artifacts = await getConfigGeneratorRunArtifacts(runId);

  let diff = parseDiffArtifact(artifacts);
  if (!diff) {
    diff = await getConfigGeneratorRunDiff(runId);
  }

  const idSuggest = await suggestNextId({
    tenantId: run.tenantId,
    deviceId: run.deviceId,
    serviceType: run.serviceType,
    siteCode: device?.site ?? undefined,
    parentInterface: text(input.interface) ?? undefined,
  }).catch(() => null);

  const idConflicts = idSuggest?.blockingConflicts ?? [];
  const baselineMissing = diff?.baseline.source === "none";

  const risk = assessRisk({ validation, diff, idConflicts, baselineMissing });
  const validations = splitValidation(validation);
  const originLists = buildFieldOriginLists(fieldOrigins);

  const candidateConfig = ensureNoSecrets(latestArtifactContent(artifacts, "candidate_config") ?? run.renderedConfig);
  const postcheckCommands = latestArtifactContent(artifacts, "postcheck_commands") ?? "";
  const rollbackContent = latestArtifactContent(artifacts, "rollback_placeholder") ?? "";

  const generatedAt = new Date().toISOString();
  const previewBase: Omit<ConfigGeneratorChangeRequestPreview, "ticketMarkdown" | "id" | "artifactChecksum"> = {
    runId,
    tenantId: run.tenantId,
    deviceId: run.deviceId,
    serviceType: run.serviceType,
    templateKey,
    status: "draft_preview",
    riskLevel: risk.riskLevel,
    summary: {
      title: `Change Request Preview — ${run.serviceType} @ ${device?.hostname ?? run.deviceHostname ?? run.deviceId}`,
      description: `Pacote preview-only para ${run.serviceType} no device ${device?.hostname ?? run.deviceId}. Revisão humana obrigatória.`,
      customerName: text(input.customerName) ?? text(input.customer),
      circuitId: text(input.circuitId),
      deviceName: device?.hostname ?? run.deviceHostname ?? String(run.deviceId),
      vendor: device?.vendor ?? "unknown",
      platform: device?.platform ?? "unknown",
    },
    scope: buildScope(input, run, device?.hostname ?? run.deviceHostname ?? String(run.deviceId), device?.site ?? null),
    inputs: {
      fieldOrigins,
      ...originLists,
    },
    validations,
    idAllocation: {
      suggestions: idSuggest?.suggestions ?? {},
      usedIdsSummary: idSuggest?.usedIdsSummary ?? {},
      conflicts: idConflicts,
    },
    diff: {
      baseline: diff?.baseline ?? { source: "none", deviceId: run.deviceId, collectedAt: null, checksum: null },
      summary: diff?.summary ?? {
        alreadyPresent: 0,
        newCandidate: 0,
        conflicts: 0,
        manualReview: 0,
        unknown: 0,
        missingDependencies: 0,
        globalExisting: 0,
        globalMissing: 0,
      },
      blocking: diff?.blocking ?? false,
      candidateChecksum: diff?.candidateChecksum ?? checksumJson({ renderedConfig: candidateConfig }),
      baselineChecksum: diff?.baselineChecksum ?? null,
      precheckChecksum: diff ? checksumJson({ artifactType: "precheck_diff", diff: diff.summary, blocking: diff.blocking }) : null,
    },
    candidateConfig,
    postcheckCommands,
    rollbackPlan: {
      type: "manual_placeholder",
      notes: [
        "Rollback manual — não remove objetos globais automaticamente.",
        "Validar dependências compartilhadas antes de qualquer reversão.",
        "Controlled Execution não foi acionado nesta fase.",
      ],
      content: rollbackContent,
    },
    riskAssessment: {
      score: risk.score,
      factors: risk.factors,
    },
    generatedAt,
    generatedBy: actorId ?? run.createdBy ?? null,
  };

  const ticketMarkdown = buildTicketMarkdown(previewBase);
  const preview: ConfigGeneratorChangeRequestPreview = {
    ...previewBase,
    id: `cr-preview-${runId}-${Date.now()}`,
    ticketMarkdown,
    artifactChecksum: checksumJson({ preview: previewBase, ticketMarkdown }),
  };

  return preview;
}

export async function persistChangeRequestPreviewArtifacts(runId: number, preview: ConfigGeneratorChangeRequestPreview) {
  const payload = JSON.stringify(preview);
  const ticket = preview.ticketMarkdown;
  const riskPayload = JSON.stringify(preview.riskAssessment);
  const packagePayload = JSON.stringify({
    runId,
    previewId: preview.id,
    ticketMarkdown: ticket,
    candidateChecksum: preview.diff.candidateChecksum,
    precheckChecksum: preview.diff.precheckChecksum,
    generatedAt: preview.generatedAt,
  });

  const rows = await db.insert(configGeneratorArtifactsTable).values([
    {
      runId,
      artifactType: "change_request_preview",
      content: payload,
      checksum: checksumJson({ artifactType: "change_request_preview", content: payload }),
    },
    {
      runId,
      artifactType: "ticket_markdown",
      content: ticket,
      checksum: checksumJson({ artifactType: "ticket_markdown", content: ticket, previewId: preview.id }),
    },
    {
      runId,
      artifactType: "risk_assessment",
      content: riskPayload,
      checksum: checksumJson({ artifactType: "risk_assessment", content: riskPayload }),
    },
    {
      runId,
      artifactType: "implementation_package",
      content: packagePayload,
      checksum: checksumJson({ artifactType: "implementation_package", content: packagePayload }),
    },
  ]).returning({ id: configGeneratorArtifactsTable.id, artifactType: configGeneratorArtifactsTable.artifactType });

  const previewRow = rows.find((row) => row.artifactType === "change_request_preview");
  return previewRow?.id ?? rows[0]?.id ?? null;
}

export async function generateChangeRequestPreview(runId: number, actorId?: number | null) {
  const preview = await buildChangeRequestPreview(runId, actorId);
  const artifactId = await persistChangeRequestPreviewArtifacts(runId, preview);
  return { preview, artifactId: artifactId ?? 0 };
}

export async function getChangeRequestPreview(runId: number): Promise<ConfigGeneratorChangeRequestPreview | null> {
  const artifacts = await getConfigGeneratorRunArtifacts(runId);
  const latestPreview = [...artifacts].reverse().find((item) => item.artifactType === "change_request_preview");
  if (!latestPreview) return null;
  try {
    return JSON.parse(latestPreview.content) as ConfigGeneratorChangeRequestPreview;
  } catch {
    return null;
  }
}

export { assessRisk, buildTicketMarkdown };

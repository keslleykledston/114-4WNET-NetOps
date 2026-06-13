import { and, desc, eq } from "drizzle-orm";
import {
  bgpAnnouncementChangePreviewsTable,
  db,
} from "@workspace/db";
import type { ParsedPolicyDependencyConfig } from "../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import type {
  AnnouncementChangePreview,
  CellState,
  ChangePreviewActionType,
  ChangePreviewRiskAssessment,
  ChangePreviewRiskLevel,
  ChangePreviewState,
  ChangePreviewValidation,
  CreateChangePreviewRequest,
  MatrixResponse,
  MatrixRow,
  PreviewChangeResponse,
  ProtectedGlobalDependency,
  UpstreamAuditImpactItem,
} from "./bgp-announcement.types.js";
import { CHANGE_PREVIEW_ACTION_TYPES, STATE_TO_ACTION_CODE, CELL_STATE_TO_LABEL } from "./bgp-announcement.types.js";
import {
  loadLatestMatrixSnapshot,
  loadMatrixSnapshotById,
  matrixSnapshotRowToResponse,
} from "./announcement-matrix-snapshot.service.js";
import { parseCircuitPolicyName } from "./parsers/circuit-policy.parser.js";
import { parseCircuitCommunity } from "./parsers/community-circuit.parser.js";
import { applyCircuitStateChange } from "./resolvers/community-set-matcher.js";
import {
  enrichMatrixRowSemantics,
  isEditableMatrixRow,
  isProtectedGlobalDependency,
  isRealMatrixConflict,
} from "./resolvers/semantic-dependency-classifier.js";
import { enrichMatrixResponseSemantics } from "./services/semantic-matrix-view.service.js";
import { loadAnnouncementDeviceContext } from "./services/announcement-context.service.js";
import { compileAnnouncementPreview } from "./services/announcement-preview.service.js";
import { ensureUpstreamCircuitsInDb } from "./services/upstream-circuit-discovery.service.js";
import {
  buildClearPrependProposedState,
  buildClearPrependRiskHints,
  buildPrependLogicalDiff,
  buildPrependStructuredDiff,
  buildPrependTicketSection,
  buildSetPrependProposedState,
  buildSetPrependRiskHints,
  detectPrependForUpstream,
  validatePrependCount,
} from "./announcement-prepend-preview.service.js";
import type { ChangePreviewLogicalDiffItem, ChangePreviewPrependDiffEntry } from "./bgp-announcement.types.js";

const AUDIT_ONLY_ROLES = new Set(["provider", "upstream", "ix", "cdn"]);

function normalizeCircuitId(value: string | undefined): string | null {
  if (!value) return null;
  return value.padStart(2, "0").slice(-2);
}

function isValidActionType(value: string): value is ChangePreviewActionType {
  return CHANGE_PREVIEW_ACTION_TYPES.includes(value as ChangePreviewActionType);
}

function buildCurrentState(row: MatrixRow): ChangePreviewState {
  const cellStates: Record<string, string> = {};
  const prependCounts: Record<string, number | null> = {};
  const communities = new Set<string>();

  for (const cell of row.cells) {
    cellStates[cell.circuitId] = cell.label;
    prependCounts[cell.circuitId] = cell.prependCount;
    if (cell.community) communities.add(cell.community);
  }

  return {
    communities: [...communities],
    cellStates,
    prependCounts,
    announcementAllowed: row.cells.some((cell) => !["Off", "BH", "—"].includes(cell.label)),
    notes: [],
  };
}

function mapActionToCellState(
  actionType: ChangePreviewActionType,
  newState?: CreateChangePreviewRequest["newState"],
): CellState | null {
  if (actionType === "block_announcement") return "off";
  if (actionType === "allow_announcement") return "on";
  if (actionType === "set_community" && newState) return newState;
  return null;
}

function buildProposedStateFromCompiler(
  current: ChangePreviewState,
  upstreamCircuitId: string,
  compiled: { newState: string; newCommunities: string[]; oldState: string },
): ChangePreviewState {
  const cellStates = { ...current.cellStates, [upstreamCircuitId]: compiled.newState };
  return {
    communities: compiled.newCommunities,
    cellStates,
    prependCounts: { ...current.prependCounts },
    announcementAllowed: compiled.newState !== "Off" && compiled.newState !== "BH",
    notes: [`Upstream ${upstreamCircuitId}: ${compiled.oldState} → ${compiled.newState}`],
  };
}

function buildProposedStateForCommunityMutation(
  current: ChangePreviewState,
  actionType: "add_community" | "remove_community",
  community: string,
  upstreamCircuitId: string | null,
): ChangePreviewState {
  let communities = [...current.communities];
  if (actionType === "add_community" && !communities.includes(community)) {
    communities.push(community);
  }
  if (actionType === "remove_community") {
    communities = communities.filter((item) => item !== community);
  }

  const notes = [
    actionType === "add_community"
      ? `Adicionar community ${community}`
      : `Remover community ${community}`,
  ];
  if (upstreamCircuitId) {
    notes.push(`Escopo upstream C${upstreamCircuitId} (import policy)`);
  }

  return {
    communities,
    cellStates: { ...current.cellStates },
    prependCounts: { ...current.prependCounts },
    announcementAllowed: current.announcementAllowed,
    notes,
  };
}

function buildLogicalDiff(current: ChangePreviewState, proposed: ChangePreviewState): string[] {
  const diff: string[] = [];

  const currentCommunities = new Set(current.communities);
  const proposedCommunities = new Set(proposed.communities);
  for (const community of proposedCommunities) {
    if (!currentCommunities.has(community)) {
      diff.push(`+ community ${community}`);
    }
  }
  for (const community of currentCommunities) {
    if (!proposedCommunities.has(community)) {
      diff.push(`- community ${community}`);
    }
  }

  for (const [circuitId, label] of Object.entries(proposed.cellStates)) {
    const before = current.cellStates[circuitId];
    if (before !== label) {
      diff.push(`C${circuitId} estado: ${before ?? "—"} → ${label}`);
    }
  }

  if (current.announcementAllowed !== proposed.announcementAllowed) {
    diff.push(`Anúncio permitido: ${current.announcementAllowed ? "sim" : "não"} → ${proposed.announcementAllowed ? "sim" : "não"}`);
  }

  for (const note of proposed.notes) {
    diff.push(note);
  }

  return diff.length > 0 ? diff : ["(sem alteração lógica detectada)"];
}

function collectProtectedGlobalsForRow(
  row: MatrixRow,
  semanticView?: MatrixResponse["semanticView"],
): ProtectedGlobalDependency[] {
  const globals = semanticView?.protectedGlobals ?? [];
  const names = new Set([row.prefixListName, row.prefixScope].filter(Boolean) as string[]);
  return globals.filter((item) => names.has(item.objectName));
}

function buildUpstreamAuditImpact(
  matrix: MatrixResponse,
  upstreamCircuitId: string | null,
  parsedConfig?: ParsedPolicyDependencyConfig,
): UpstreamAuditImpactItem[] {
  const targets = upstreamCircuitId
    ? matrix.upstreams.filter((item) => item.circuitId === upstreamCircuitId)
    : matrix.upstreams;

  return targets.map((upstream) => {
    const exportPolicyName = parsedConfig
      ? Object.keys(parsedConfig.consumers.route_policies).find((name) => {
        const parsed = parseCircuitPolicyName(name);
        return parsed?.circuitId === upstream.circuitId && parsed.function === "EXPORT";
      }) ?? null
      : null;

    return {
      circuitId: upstream.circuitId,
      displayName: upstream.displayName,
      exportPolicyName,
      auditNotes: [
        "Export policy auditada somente — não é alvo de edição nesta fase.",
        exportPolicyName
          ? `Export associada: ${exportPolicyName}`
          : "Export policy não encontrada no snapshot persistido.",
      ],
      readOnly: true as const,
    };
  });
}

function assessRisk(input: {
  row: MatrixRow;
  validation: ChangePreviewValidation;
  hasSharedDependency: boolean;
  hasRealConflict: boolean;
  ambiguousCommunity: boolean;
  multiCustomerImpact: boolean;
}): ChangePreviewRiskAssessment {
  const reasons: string[] = [];

  if (input.validation.status === "blocked") {
    return {
      level: "blocked",
      blocked: true,
      reasons: input.validation.errors,
      summary: "Preview bloqueado — target ou ação não permitida.",
    };
  }

  if (input.validation.status === "unsupported_preview") {
    return {
      level: "blocked",
      blocked: true,
      reasons: input.validation.errors,
      summary: "Ação ainda não suportada pelo compilador seguro.",
    };
  }

  if (input.hasRealConflict) {
    reasons.push("Target com conflito real na matriz.");
  }
  if (input.hasSharedDependency) {
    reasons.push("Dependência compartilhada exige revisão manual.");
  }
  if (input.ambiguousCommunity) {
    reasons.push("Community ambígua ou não resolvida.");
  }
  if (input.multiCustomerImpact) {
    reasons.push("Alteração pode impactar múltiplos clientes.");
  }
  if (input.validation.warnings.length > 0) {
    reasons.push(...input.validation.warnings);
  }

  let level: ChangePreviewRiskLevel = "low";
  if (input.hasRealConflict || input.multiCustomerImpact || input.ambiguousCommunity) {
    level = "high";
  } else if (input.hasSharedDependency || input.validation.warnings.length > 0) {
    level = "medium";
  }

  if (rowRiskIsHigh(input.row)) {
    level = level === "low" ? "medium" : level;
    reasons.push(`Risco baseline da linha: ${input.row.riskLevel}.`);
  }

  return {
    level,
    blocked: false,
    reasons,
    summary: level === "low"
      ? "Alteração lógica simples em target Cliente/ORIGIN sem conflito."
      : level === "medium"
        ? "Dados incompletos ou dependência compartilhada — revisar antes de qualquer apply futuro."
        : "Alto risco — conflito ou impacto amplo detectado.",
  };
}

function rowRiskIsHigh(row: MatrixRow): boolean {
  return row.riskLevel === "high" || row.riskLevel === "critical";
}

export function generateChangePreviewTicketMarkdown(
  preview: AnnouncementChangePreview & { riskHints?: string[] },
): string {
  const riskHints = preview.riskHints ?? [];
  const prependSection = preview.actionType === "set_prepend" || preview.actionType === "clear_prepend"
    ? buildPrependTicketSection({
        actionType: preview.actionType,
        targetName: preview.targetName,
        targetRole: preview.targetRole,
        upstreamCircuitId: preview.upstreamCircuitId,
        currentState: preview.currentState,
        proposedState: preview.proposedState,
        structured: preview.logicalDiff.find(
          (item): item is ChangePreviewPrependDiffEntry =>
            typeof item !== "string" && item.operation === preview.actionType,
        ) ?? null,
        riskHints,
      })
    : [];

  const diffLines = preview.logicalDiff.map((item) => {
    if (typeof item === "string") return `- ${item}`;
    return `- ${item.explanation} (prepend: ${item.before.prepend} → ${item.after.prepend})`;
  });

  const lines: string[] = [
    `# BGP Announcement Change Preview`,
    "",
    `**Alvo:** ${preview.targetName} (${preview.targetRole})`,
    `**Target ID:** ${preview.targetId}`,
    `**Device ID:** ${preview.deviceId}`,
    `**Snapshot:** ${preview.snapshotId ?? "—"}`,
    `**Ação:** ${preview.actionType}`,
    preview.upstreamCircuitId ? `**Upstream (marcação):** C${preview.upstreamCircuitId}` : "",
    "",
    "## Estado atual",
    `- Communities: ${preview.currentState.communities.join(", ") || "(nenhuma)"}`,
    `- Anúncio permitido: ${preview.currentState.announcementAllowed ? "sim" : "não"}`,
    ...Object.entries(preview.currentState.cellStates).map(([cid, label]) => `- C${cid}: ${label}`),
    "",
    "## Estado proposto",
    `- Communities: ${preview.proposedState.communities.join(", ") || "(nenhuma)"}`,
    `- Anúncio permitido: ${preview.proposedState.announcementAllowed ? "sim" : "não"}`,
    ...Object.entries(preview.proposedState.cellStates).map(([cid, label]) => `- C${cid}: ${label}`),
    "",
    "## Diff lógico",
    ...diffLines,
    "",
    ...(prependSection.length > 0 ? prependSection : []),
    "## Riscos",
    `- Nível: **${preview.riskAssessment.level}**`,
    `- ${preview.riskAssessment.summary}`,
    ...preview.riskAssessment.reasons.map((reason) => `- ${reason}`),
    ...(riskHints.length > 0
      ? ["", "### Risk hints (prepend)", ...riskHints.map((hint) => `- ${hint}`)]
      : []),
    "",
    "## Validações",
    `- Status: ${preview.validation.status}`,
    ...preview.validation.errors.map((error) => `- ERRO: ${error}`),
    ...preview.validation.warnings.map((warning) => `- AVISO: ${warning}`),
    "",
    "## Dependências globais protegidas",
    ...(preview.protectedGlobals.length > 0
      ? preview.protectedGlobals.map((item) => `- ${item.objectName}: ${item.reason}`)
      : ["- (nenhuma dependência global direta no target)"]),
    "",
    "## Impacto upstream (auditoria)",
    ...preview.upstreamAuditImpact.flatMap((item) => [
      `- **${item.displayName} (C${item.circuitId})**`,
      ...item.auditNotes.map((note) => `  - ${note}`),
    ]),
    "",
    "## Observações",
    "- Nenhum comando foi executado.",
    "- Preview gerado a partir de snapshot persistido.",
    "- Objetos globais não devem ser removidos.",
    "- Upstreams são auditoria, não alvo de edição nesta fase.",
    "",
    `Gerado em: ${preview.createdAt ?? new Date().toISOString()}`,
  ];

  return lines.filter((line, index, array) => !(line === "" && array[index - 1] === "")).join("\n");
}

function validateTargetForPreview(
  row: MatrixRow,
  actionType: ChangePreviewActionType,
  community: string | undefined,
): ChangePreviewValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (actionType === "audit_only_note") {
    errors.push("audit_only_note é apenas para targets de auditoria.");
    return { status: "blocked", ok: false, errors, warnings };
  }

  if (actionType === "set_prepend" || actionType === "clear_prepend") {
    if (row.targetRole !== "customer" && row.targetRole !== "origin") {
      errors.push(`set_prepend/clear_prepend permitido apenas para customer/origin (atual: ${row.targetRole ?? "unknown"}).`);
    }
    const allowedScopes = new Set(["customer_specific", "circuit_specific", "local", "unknown"]);
    if (row.dependencyScope && !allowedScopes.has(row.dependencyScope)) {
      warnings.push(`dependencyScope=${row.dependencyScope} — revisar impacto antes de prepend manual.`);
    }
  }

  if (row.targetEditMode !== "editable_future") {
    errors.push(`targetEditMode=${row.targetEditMode ?? "unknown"} não é editável.`);
  }
  if (row.targetRole && AUDIT_ONLY_ROLES.has(row.targetRole)) {
    errors.push(`targetRole=${row.targetRole} é audit-only.`);
  }
  if (row.targetRole === "unknown" || row.targetRole === "ibgp") {
    errors.push(`targetRole=${row.targetRole ?? "unknown"} bloqueado para preview editável.`);
  }
  if (!isEditableMatrixRow(row)) {
    errors.push("Target não classificado como editable_future/modificável.");
  }
  if (/export/i.test(row.routePolicyName)) {
    errors.push("Export policy não é foco de edição nesta fase.");
  }
  if (row.dependencyProtection === "protected_global" || row.dependencyProtection === "protected_system") {
    errors.push("Dependência global/sistema protegida — alteração bloqueada.");
  }

  if (actionType === "remove_community" && community) {
    const filterName = community.split(":")[0];
    if (isProtectedGlobalDependency(filterName) || isProtectedGlobalDependency(community, "community-filter")) {
      errors.push("Não é permitido remover community/filter global protegido.");
    }
  }

  if (row.findings.some((finding) => finding.code.includes("INSUFFICIENT") || finding.severity === "low")) {
    warnings.push("Dados insuficientes ou baseline parcial — revisão manual recomendada.");
  }
  if (row.dependencyProtection === "shared_requires_review") {
    warnings.push("Dependência compartilhada detectada — revisar impacto.");
  }
  if (isRealMatrixConflict(row)) {
    warnings.push("Target possui conflito real na matriz.");
  }

  if (errors.length > 0) {
    return { status: "blocked", ok: false, errors, warnings };
  }
  if (warnings.length > 0) {
    return { status: "warning", ok: true, errors, warnings };
  }
  return { status: "ok", ok: true, errors, warnings };
}

async function loadMatrixForPreview(deviceId: number, snapshotId?: number) {
  const snapshotRow = snapshotId != null
    ? await loadMatrixSnapshotById(snapshotId)
    : await loadLatestMatrixSnapshot(deviceId);

  if (!snapshotRow || snapshotRow.deviceId !== deviceId) {
    return "snapshot_not_found" as const;
  }

  const matrix = matrixSnapshotRowToResponse(snapshotRow);
  if (!matrix) return "snapshot_incompatible" as const;

  const ctx = await loadAnnouncementDeviceContext(deviceId);
  const parsedConfig = ctx !== "no_data" ? ctx.parsedConfig : undefined;
  const enriched = enrichMatrixResponseSemantics(matrix, parsedConfig);

  return {
    snapshotId: snapshotRow.id,
    matrix: enriched,
    parsedConfig,
    ctx: ctx !== "no_data" ? ctx : null,
  };
}

export async function createAnnouncementChangePreview(
  request: CreateChangePreviewRequest,
  createdBy: number | null,
): Promise<AnnouncementChangePreview | "snapshot_not_found" | "target_not_found" | "invalid_request"> {
  if (!isValidActionType(request.actionType)) {
    return "invalid_request";
  }

  const loaded = await loadMatrixForPreview(request.deviceId, request.snapshotId);
  if (loaded === "snapshot_not_found" || loaded === "snapshot_incompatible") {
    return "snapshot_not_found";
  }

  const { matrix, parsedConfig, ctx, snapshotId } = loaded;
  let row = matrix.rows.find((item: MatrixRow) => item.targetKey === request.targetId);
  if (!row) return "target_not_found";

  row = enrichMatrixRowSemantics(row, parsedConfig);
  const upstreamCircuitId = normalizeCircuitId(request.upstreamCircuitId);
  const currentState = buildCurrentState(row);

  let validation = validateTargetForPreview(row, request.actionType, request.community);
  let proposedState = currentState;
  let logicalDiff: ChangePreviewLogicalDiffItem[] = [];
  let riskHints: string[] = [];
  let affectedCommunities: string[] = [];
  let compiledPreview: PreviewChangeResponse | null = null;

  const needsUpstream = [
    "set_community",
    "block_announcement",
    "allow_announcement",
    "set_prepend",
    "clear_prepend",
  ].includes(request.actionType);
  if (needsUpstream && !upstreamCircuitId) {
    validation = {
      status: "blocked",
      ok: false,
      errors: ["upstreamCircuitId obrigatório para esta ação."],
      warnings: validation.warnings,
    };
  }

  if (validation.ok && (request.actionType === "set_prepend" || request.actionType === "clear_prepend") && upstreamCircuitId) {
    if (request.actionType === "set_prepend") {
      const prependValidation = validatePrependCount(request.prependCount);
      if (!prependValidation.ok) {
        validation = { ...prependValidation, warnings: [...validation.warnings, ...prependValidation.warnings] };
      } else {
        const beforePrepend = detectPrependForUpstream(row, upstreamCircuitId);
        proposedState = buildSetPrependProposedState(currentState, upstreamCircuitId, request.prependCount!);
        const structured = buildPrependStructuredDiff({
          operation: "set_prepend",
          row,
          upstreamCircuitId,
          beforePrepend,
          afterPrepend: request.prependCount!,
        });
        logicalDiff = buildPrependLogicalDiff(structured);
        riskHints = buildSetPrependRiskHints({
          row,
          upstreamCircuitId,
          prependCount: request.prependCount!,
          upstreamCount: matrix.upstreams.length,
        });
        if (beforePrepend !== null && beforePrepend !== "unknown" && beforePrepend !== request.prependCount) {
          validation = {
            status: "warning",
            ok: true,
            errors: [],
            warnings: [
              ...validation.warnings,
              `Prepend detectado (${beforePrepend}) será substituído por ${request.prependCount}.`,
            ],
          };
        }
      }
    } else {
      const beforePrepend = detectPrependForUpstream(row, upstreamCircuitId);
      const hadPrepend = typeof beforePrepend === "number" && beforePrepend > 0;
      proposedState = buildClearPrependProposedState(currentState, upstreamCircuitId);
      const structured = buildPrependStructuredDiff({
        operation: "clear_prepend",
        row,
        upstreamCircuitId,
        beforePrepend,
        afterPrepend: null,
      });
      logicalDiff = buildPrependLogicalDiff(structured);
      riskHints = buildClearPrependRiskHints({ row, hadPrepend });
      if (!hadPrepend) {
        validation = {
          status: "warning",
          ok: true,
          errors: [],
          warnings: [
            ...validation.warnings,
            "Nenhum prepend detectável no snapshot — clear_prepend documental/no-op.",
          ],
        };
      }
    }
  }

  if (validation.ok && needsUpstream && upstreamCircuitId && !["set_prepend", "clear_prepend"].includes(request.actionType)) {
    if (request.actionType === "set_community" && !request.newState) {
      validation = {
        status: "blocked",
        ok: false,
        errors: ["newState obrigatório para set_community."],
        warnings: validation.warnings,
      };
    }

    const mappedState = mapActionToCellState(request.actionType, request.newState);
    if (validation.ok && !mappedState) {
      validation = {
        status: "blocked",
        ok: false,
        errors: ["Ação não mapeada para estado de célula."],
        warnings: validation.warnings,
      };
    } else if (validation.ok && ctx && mappedState) {
      const upstreams = await ensureUpstreamCircuitsInDb(request.deviceId, ctx.parsedConfig);
      const previewResult = compileAnnouncementPreview({
        request: {
          deviceId: request.deviceId,
          targetPolicyName: row.routePolicyName,
          node: row.node,
          family: row.family,
          upstreamCircuitId,
          newState: mappedState as Exclude<CellState, "unknown" | "conflict">,
        },
        parsedConfig: ctx.parsedConfig,
        graph: ctx.graph,
        upstreams,
        communitySets: [],
        localAs: ctx.parsedConfig.bgp_peer_model?.localAs ?? null,
      });
      compiledPreview = previewResult;

      if (!previewResult.allowed) {
        validation = {
          status: "blocked",
          ok: false,
          errors: previewResult.blockedReasons.map((reason: string) => `Compilador: ${reason}`),
          warnings: validation.warnings,
        };
      } else {
        proposedState = buildProposedStateFromCompiler(currentState, upstreamCircuitId, previewResult);
        logicalDiff = previewResult.diff.length > 0 ? previewResult.diff : buildLogicalDiff(currentState, proposedState);
        affectedCommunities = previewResult.newCommunities;
      }
    } else if (validation.ok && mappedState) {
      validation = {
        status: "warning",
        ok: true,
        errors: [],
        warnings: [...validation.warnings, "Config persistida indisponível — diff lógico parcial."],
      };
      if (request.actionType === "block_announcement" || request.actionType === "allow_announcement") {
        proposedState = buildBlockAllowProposedState(
          currentState,
          upstreamCircuitId,
          request.actionType,
        );
      } else {
        const actionCode = STATE_TO_ACTION_CODE[mappedState] ?? null;
        if (actionCode) {
          const { communities } = applyCircuitStateChange(currentState.communities, upstreamCircuitId, actionCode);
          proposedState = {
            communities,
            cellStates: {
              ...currentState.cellStates,
              [upstreamCircuitId]: CELL_STATE_TO_LABEL[mappedState],
            },
            prependCounts: { ...currentState.prependCounts },
            announcementAllowed: !["off", "bh"].includes(mappedState),
            notes: [`C${upstreamCircuitId}: set_community → ${mappedState}`],
          };
        }
      }
      logicalDiff = buildLogicalDiff(currentState, proposedState);
      affectedCommunities = proposedState.communities;
    }
  }

  if (validation.ok && (request.actionType === "add_community" || request.actionType === "remove_community")) {
    if (!request.community) {
      validation = {
        status: "blocked",
        ok: false,
        errors: ["community obrigatória para add/remove."],
        warnings: validation.warnings,
      };
    } else {
      const parsed = parseCircuitCommunity(request.community);
      if (!parsed.valid && request.actionType === "add_community") {
        validation = {
          status: "warning",
          ok: true,
          errors: [],
          warnings: [...validation.warnings, "Community não reconhecida no namespace de circuito."],
        };
      }
      proposedState = buildProposedStateForCommunityMutation(
        currentState,
        request.actionType,
        request.community,
        upstreamCircuitId,
      );
      logicalDiff = buildLogicalDiff(currentState, proposedState);
      affectedCommunities = proposedState.communities;
    }
  }

  if (validation.ok && logicalDiff.length === 0) {
    logicalDiff = buildLogicalDiff(currentState, proposedState);
  }

  const protectedGlobals = collectProtectedGlobalsForRow(row, matrix.semanticView);
  const upstreamAuditImpact = buildUpstreamAuditImpact(matrix, upstreamCircuitId, parsedConfig);

  const riskAssessment = assessRisk({
    row,
    validation,
    hasSharedDependency: row.dependencyProtection === "shared_requires_review",
    hasRealConflict: isRealMatrixConflict(row),
    ambiguousCommunity: Boolean(request.community && !parseCircuitCommunity(request.community).valid),
    multiCustomerImpact: row.dependencyScope === "global_shared" && row.targetRole === "customer",
  });

  if (validation.ok && riskHints.length > 0) {
    riskAssessment.reasons.push(...riskHints);
    if (request.actionType === "set_prepend" && riskAssessment.level === "low") {
      riskAssessment.level = "medium";
      riskAssessment.summary = "Prepend altera preferência de caminho — revisão manual recomendada.";
    }
  }

  if (riskAssessment.level === "high" && isRealMatrixConflict(row)) {
    riskAssessment.level = "high";
    riskAssessment.summary = "Conflito real impeditivo ou alto impacto — revisão obrigatória.";
  }

  const previewBody: AnnouncementChangePreview = {
    snapshotId,
    tenantId: null,
    deviceId: request.deviceId,
    targetId: row.targetKey,
    targetName: row.routePolicyName,
    targetRole: row.targetRole ?? (row.targetType === "origin" ? "origin" : row.targetType === "customer" ? "customer" : "unknown"),
    targetEditMode: row.targetEditMode ?? "unknown",
    actionType: request.actionType,
    upstreamCircuitId,
    currentState,
    proposedState,
    logicalDiff,
    riskHints,
    affectedPolicies: [row.routePolicyName],
    affectedCommunities,
    protectedGlobals,
    upstreamAuditImpact,
    validation,
    riskAssessment,
    ticketMarkdown: "",
    createdBy,
  };

  previewBody.ticketMarkdown = generateChangePreviewTicketMarkdown({
    ...previewBody,
    createdAt: new Date().toISOString(),
  });

  const [inserted] = await db
    .insert(bgpAnnouncementChangePreviewsTable)
    .values({
      deviceId: request.deviceId,
      snapshotId,
      targetId: row.targetKey,
      previewJson: previewBody,
      createdBy,
    })
    .returning();

  return {
    ...previewBody,
    id: inserted.id,
    createdAt: inserted.createdAt.toISOString(),
  };
}

export async function getAnnouncementChangePreviewById(previewId: number) {
  const [row] = await db
    .select()
    .from(bgpAnnouncementChangePreviewsTable)
    .where(eq(bgpAnnouncementChangePreviewsTable.id, previewId))
    .limit(1);

  if (!row) return null;

  const preview = row.previewJson as AnnouncementChangePreview;
  return {
    ...preview,
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}

export async function listAnnouncementChangePreviews(filters: {
  deviceId?: number;
  snapshotId?: number;
  targetId?: string;
  limit?: number;
}) {
  const conditions = [];
  if (filters.deviceId != null) {
    conditions.push(eq(bgpAnnouncementChangePreviewsTable.deviceId, filters.deviceId));
  }
  if (filters.snapshotId != null) {
    conditions.push(eq(bgpAnnouncementChangePreviewsTable.snapshotId, filters.snapshotId));
  }
  if (filters.targetId) {
    conditions.push(eq(bgpAnnouncementChangePreviewsTable.targetId, filters.targetId));
  }

  const rows = await db
    .select()
    .from(bgpAnnouncementChangePreviewsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bgpAnnouncementChangePreviewsTable.createdAt))
    .limit(filters.limit ?? 20);

  return rows.map((row) => {
    const preview = row.previewJson as AnnouncementChangePreview;
    return {
      ...preview,
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
    };
  });
}

/** Selftest helper: preview para target audit-only retorna blocked sem side effects externos. */
export function buildBlockedAuditPreview(
  row: MatrixRow,
  actionType: ChangePreviewActionType,
): Pick<AnnouncementChangePreview, "validation" | "riskAssessment"> {
  const validation = validateTargetForPreview(row, actionType, undefined);
  const riskAssessment = assessRisk({
    row,
    validation,
    hasSharedDependency: false,
    hasRealConflict: false,
    ambiguousCommunity: false,
    multiCustomerImpact: false,
  });
  return { validation, riskAssessment };
}

/** Selftest helper: community mutation blocked for global. */
export function validateGlobalCommunityRemoval(community: string): ChangePreviewValidation {
  const errors: string[] = [];
  if (isProtectedGlobalDependency(community, "community-filter")) {
    errors.push("Não é permitido remover community/filter global protegido.");
  }
  return {
    status: errors.length > 0 ? "blocked" : "ok",
    ok: errors.length === 0,
    errors,
    warnings: [],
  };
}

/** Selftest helper: map set_community action to compiler diff presence. */
export function previewLogicalDiffFromStates(
  current: ChangePreviewState,
  proposed: ChangePreviewState,
): string[] {
  return buildLogicalDiff(current, proposed);
}

/** Selftest helper: apply circuit state for block/allow proposed state. */
export function buildBlockAllowProposedState(
  current: ChangePreviewState,
  upstreamCircuitId: string,
  actionType: "block_announcement" | "allow_announcement",
): ChangePreviewState {
  const mapped = mapActionToCellState(actionType);
  if (!mapped) return current;
  const actionCode = actionType === "block_announcement" ? "67" : "01";
  const { communities } = applyCircuitStateChange(current.communities, upstreamCircuitId, actionCode);
  const label = actionType === "block_announcement" ? "Off" : "On";
  return {
    communities,
    cellStates: { ...current.cellStates, [upstreamCircuitId]: label },
    prependCounts: { ...current.prependCounts },
    announcementAllowed: actionType === "allow_announcement",
    notes: [`C${upstreamCircuitId}: ${actionType}`],
  };
}

export {
  validateTargetForPreview,
  buildCurrentState,
  buildLogicalDiff,
  assessRisk,
  isValidActionType,
};
export {
  validatePrependCount,
  detectPrependForUpstream,
  buildPrependStructuredDiff,
  buildPrependLogicalDiff,
  buildSetPrependRiskHints,
  buildClearPrependRiskHints,
  buildPrependTicketSection,
  logicalDiffItemsToStrings,
} from "./announcement-prepend-preview.service.js";

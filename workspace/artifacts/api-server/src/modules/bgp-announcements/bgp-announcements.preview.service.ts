import { Buffer } from "node:buffer";
import { desc, eq } from "drizzle-orm";
import { buildAnnouncementGraph } from "./bgp-announcements.graph.service.js";
import { buildAnnouncementCommunitySetLibrary, findExactCommunitySetMatch } from "./bgp-announcements.audit.service.js";
import type { MatrixSnapshotView } from "./bgp-announcements.snapshot.service.js";
import type {
  AnnouncementChangePlanRecord,
  AnnouncementChangePlanStatus,
  AnnouncementCommunitySet,
  AnnouncementFinding,
  AnnouncementMatrixCell,
  AnnouncementMatrixPrefixScope,
  AnnouncementMatrixRow,
  AnnouncementMatrixTargetType,
  AnnouncementPreviewCommand,
  AnnouncementPreviewDiff,
  AnnouncementPreviewDesiredState,
  AnnouncementPreviewInput,
  AnnouncementPreviewResult,
} from "./bgp-announcements.types.js";
import { parseAnnouncementCommunityValue } from "./bgp-announcements.matrix-resolver.js";

const DESIRED_STATE_TO_ACTION_CODE: Record<Exclude<AnnouncementPreviewDesiredState, "Clear">, string> = {
  On: "01",
  P1: "02",
  P2: "03",
  P3: "04",
  P4: "05",
  NE: "08",
  Def: "09",
  BH: "66",
  Off: "67",
};

function parseDesiredState(value: unknown): AnnouncementPreviewDesiredState | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "On" || text === "P1" || text === "P2" || text === "P3" || text === "P4" || text === "Off" || text === "NE" || text === "BH" || text === "Def" || text === "Clear"
    ? text
    : null;
}

function desiredStateToActionCode(state: AnnouncementPreviewDesiredState): string | null {
  if (state === "Clear") return null;
  return DESIRED_STATE_TO_ACTION_CODE[state] ?? null;
}

function buildCommunityForCircuit(circuitId: string, actionCode: string | null): string | null {
  if (!actionCode) return null;
  return `64777:5${circuitId.padStart(2, "0")}${actionCode}`;
}

function normalizeCommunityList(communities: string[]): string[] {
  return [...new Set(communities.map((community) => community.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function encodePreviewToken(payload: Omit<AnnouncementPreviewResult, "previewId">): string {
  return `bgp-preview-v1.${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

function decodePreviewToken(previewId: string): Omit<AnnouncementPreviewResult, "previewId"> | null {
  const [prefix, encoded] = previewId.split(".", 2);
  if (prefix !== "bgp-preview-v1" || !encoded) return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Omit<AnnouncementPreviewResult, "previewId">;
  } catch {
    return null;
  }
}

async function loadAnnouncementGraphInput(deviceId: number) {
  const { getLatestDiscoverySnapshot } = await import("../netops/device-discovery/discovery.service.js");
  const { loadAnnouncementDeviceContext } = await import("./services/announcement-context.service.js");
  const announcementContext = await loadAnnouncementDeviceContext(deviceId);
  if (announcementContext === "no_data") return null;

  const discoverySnapshot = await getLatestDiscoverySnapshot(deviceId);
  return {
    rawConfig: announcementContext.rawConfig,
    localAs: discoverySnapshot?.parsed_config?.bgp_peer_model?.localAs ?? null,
    routePolicies: Object.values(announcementContext.parsedConfig.consumers.route_policies).map((policy) => ({
      name: policy.name,
      nodes: policy.nodes.map((node) => ({
        sequence: node.sequence,
        action: node.action,
        matches: node.matches,
        applies: node.applies,
      })),
    })),
    bgpPeers: discoverySnapshot?.bgpPeers
      ?? Object.values(announcementContext.parsedConfig.consumers.bgp_peers).map((peer) => ({
        peerIp: peer.peerIp ?? peer.name ?? "",
        name: peer.name ?? null,
        role: "unknown",
        importPolicy: peer.importPolicy ?? null,
        exportPolicy: peer.exportPolicy ?? null,
        addressFamily: "unknown",
      })),
  };
}

async function loadBaseSnapshotOrError(deviceId: number, baseSnapshotId: number): Promise<
  | { ok: true; snapshot: MatrixSnapshotView }
  | { ok: false; error: string; status: number; message: string }
> {
  const { bgpAnnouncementMatrixSnapshotsTable, db } = await import("@workspace/db");
  const { loadLatestMatrixSnapshot } = await import("./bgp-announcements.snapshot.service.js");
  const latest = await loadLatestMatrixSnapshot(deviceId);
  if (!latest) {
    return { ok: false, error: "SNAPSHOT_NOT_FOUND", status: 404, message: "Nenhum snapshot latest disponível" };
  }
  const [snapshotRow] = await db
    .select()
    .from(bgpAnnouncementMatrixSnapshotsTable)
    .where(eq(bgpAnnouncementMatrixSnapshotsTable.id, baseSnapshotId))
    .limit(1);
  if (!snapshotRow || snapshotRow.deviceId !== deviceId) {
    return { ok: false, error: "SNAPSHOT_NOT_FOUND", status: 404, message: "Snapshot base não encontrado" };
  }
  if (latest.id !== baseSnapshotId) {
    return { ok: false, error: "SNAPSHOT_NOT_LATEST", status: 409, message: "base_snapshot_id não é o latest atual" };
  }
  if (snapshotRow.status !== "completed") {
    return { ok: false, error: "SNAPSHOT_NOT_FOUND", status: 409, message: "snapshot base não está completed" };
  }
  const ageMs = Date.now() - new Date(snapshotRow.generatedAt).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) {
    return { ok: false, error: "SNAPSHOT_STALE", status: 409, message: "snapshot base stale" };
  }
  return { ok: true, snapshot: latest };
}

async function hasRefreshInProgress(deviceId: number): Promise<boolean> {
  const { bgpAnnouncementMatrixRunsTable, db } = await import("@workspace/db");
  const [row] = await db
    .select({ id: bgpAnnouncementMatrixRunsTable.id })
    .from(bgpAnnouncementMatrixRunsTable)
    .where(eq(bgpAnnouncementMatrixRunsTable.deviceId, deviceId))
    .orderBy(desc(bgpAnnouncementMatrixRunsTable.startedAt))
    .limit(1);
  if (!row) return false;
  const [run] = await db
    .select({ status: bgpAnnouncementMatrixRunsTable.status })
    .from(bgpAnnouncementMatrixRunsTable)
    .where(eq(bgpAnnouncementMatrixRunsTable.id, row.id))
    .limit(1);
  return run ? ["pending", "running"].includes(String(run.status)) : false;
}

function rowToCurrentCommunities(row: AnnouncementMatrixRow, selectedCircuitId: string): { communities: string[]; sourceType: "direct" | "community_list" | "unknown"; sourceName: string | null; currentCell: AnnouncementMatrixCell | null } {
  const currentCell = row.cells[selectedCircuitId] ?? null;
  const sources = Object.values(row.cells)
    .flatMap((cell) => Array.isArray(cell.communities) && cell.communities.length > 0 ? cell.communities : cell.community ? [cell.community] : [])
    .map((community) => community.trim())
    .filter(Boolean);
  const currentCommunities = normalizeCommunityList(sources);
  return {
    communities: currentCommunities,
    sourceType: currentCell?.communitySourceType ?? "unknown",
    sourceName: currentCell?.communitySourceName ?? null,
    currentCell,
  };
}

function buildCommands(policyName: string, node: number, communities: string[], source: "direct" | "community_list", listName: string | null, confidence: "high" | "medium" | "low"): AnnouncementPreviewCommand[] {
  const commands: AnnouncementPreviewCommand[] = [
    { command: "system-view", confidence },
    { command: `route-policy ${policyName} permit node ${node}`, confidence },
  ];
  if (source === "community_list" && listName) {
    commands.push({ command: `apply community community-list ${listName}`, confidence });
  } else if (communities.length > 0) {
    commands.push({ command: `apply community ${communities.join(" ")}`, confidence });
  }
  commands.push({ command: "return", confidence });
  return commands;
}

function buildRollbackCommands(policyName: string, node: number, communities: string[], source: "direct" | "community_list", listName: string | null, confidence: "high" | "medium" | "low"): AnnouncementPreviewCommand[] {
  const commands: AnnouncementPreviewCommand[] = [
    { command: "system-view", confidence },
    { command: `route-policy ${policyName} permit node ${node}`, confidence },
  ];
  if (source === "community_list" && listName) {
    commands.push({ command: `apply community community-list ${listName}`, confidence });
  } else if (communities.length > 0) {
    commands.push({ command: `apply community ${communities.join(" ")}`, confidence });
  } else {
    commands.push({ command: "undo apply community", confidence, note: "clear rollback" });
  }
  commands.push({ command: "return", confidence });
  return commands;
}

function makeFinding(code: string, severity: "info" | "warning" | "error", scope: "target" | "cell" | "upstream" | "community_set" | "prefix_scope" | "protected_global_filter" | "snapshot", message: string, extra: Partial<AnnouncementFinding> = {}): AnnouncementFinding {
  return {
    code,
    severity,
    scope,
    message,
    ...extra,
  };
}

function summarizeRisk(findings: AnnouncementFinding[], blocked: boolean): "low" | "medium" | "high" | "critical" {
  if (blocked) return "critical";
  if (findings.some((finding) => finding.severity === "error")) return "high";
  if (findings.some((finding) => finding.code === "COMMUNITY_SET_NO_EXACT_MATCH" || finding.code === "PREVIEW_ROLLBACK_LOW_CONFIDENCE" || finding.code === "TARGET_POLICY_USES_SHARED_COMMUNITY_LIST")) {
    return "medium";
  }
  return "low";
}

export interface AnnouncementPreviewSimulationInput {
  baseSnapshotId: number;
  deviceId: number;
  collectionId: number | null;
  targetPolicyName: string;
  targetType: AnnouncementMatrixTargetType;
  node: number;
  upstreamCircuitId: string;
  upstreamName: string;
  prefixScope: AnnouncementMatrixPrefixScope;
  currentState: string;
  desiredState: AnnouncementPreviewDesiredState;
  currentCommunity: string | null;
  currentCommunitySourceType: "direct" | "community_list" | "unknown";
  currentCommunitySourceName: string | null;
  currentCommunities: string[];
  communitySets: AnnouncementCommunitySet[];
  note?: string | null;
}

export function buildAnnouncementPreviewTargetGateFindings(input: {
  targetType: string;
  includeInAnnouncementMatrix: boolean;
  policyType?: string;
}): { blocked: boolean; code?: string; message?: string } {
  if (input.includeInAnnouncementMatrix) {
    return { blocked: false };
  }
  const policyType = input.policyType ?? input.targetType;
  if (policyType === "customer_export") {
    return { blocked: true, code: "TARGET_IS_EXPORT_POLICY", message: "Target é export" };
  }
  if (policyType === "upstream_export_audit" || policyType === "upstream_import_audit") {
    return { blocked: true, code: "TARGET_IS_UPSTREAM_AUDIT_ONLY", message: "Target é upstream audit-only" };
  }
  return { blocked: true, code: "TARGET_NOT_MODIFIABLE", message: "Target não modificável" };
}

export function simulateAnnouncementPreview(input: AnnouncementPreviewSimulationInput): Omit<AnnouncementPreviewResult, "previewId"> {
  const selectedCircuitId = input.upstreamCircuitId.trim();
  const currentCommunities = normalizeCommunityList(input.currentCommunities);
  const currentCircuitCommunities = currentCommunities.filter((community) => parseAnnouncementCommunityValue(community).circuitId === selectedCircuitId);
  const removedCommunities = currentCircuitCommunities.length > 0 ? currentCircuitCommunities : input.currentCommunity ? [input.currentCommunity] : [];
  const preservedCommunities = currentCommunities.filter((community) => !removedCommunities.includes(community));
  const desiredActionCode = desiredStateToActionCode(input.desiredState);
  const desiredCommunity = buildCommunityForCircuit(selectedCircuitId, desiredActionCode);
  const desiredCommunities = input.desiredState === "Clear"
    ? preservedCommunities
    : normalizeCommunityList([...preservedCommunities, desiredCommunity ?? ""]);
  const communitySetMatch = findExactCommunitySetMatch(desiredCommunities.filter(Boolean), input.communitySets);
  const useCommunityList = Boolean(communitySetMatch.matched && communitySetMatch.communityListName);
  const findings: AnnouncementFinding[] = [];

  if (currentCircuitCommunities.length > 1) {
    findings.push(makeFinding(
      "MULTIPLE_ACTIONS_FOR_SAME_UPSTREAM",
      "error",
      "cell",
      `Conflito atual no upstream ${selectedCircuitId}: ${currentCircuitCommunities.join(", ")}`,
      { evidence: { currentCircuitCommunities } },
    ));
  }

  if (communitySetMatch.matched) {
    findings.push(makeFinding(
      "COMMUNITY_SET_EXACT_MATCH_FOUND",
      "info",
      "community_set",
      `Community-set exato encontrado: ${communitySetMatch.communityListName}`,
      { communityList: communitySetMatch.communityListName, evidence: { normalizedHash: communitySetMatch.normalizedHash } },
    ));
  } else {
    findings.push(makeFinding(
      "COMMUNITY_SET_NO_EXACT_MATCH",
      "info",
      "community_set",
      "Nenhum community-set exato encontrado. Preview vai propor communities diretas.",
      { evidence: { desiredCommunities } },
    ));
  }

  if (input.currentCommunitySourceType === "community_list" && input.currentCommunitySourceName) {
    findings.push(makeFinding(
      "PREVIEW_USES_EXISTING_COMMUNITY_LIST",
      "info",
      "community_set",
      `Target atual usa community-list ${input.currentCommunitySourceName}.`,
      { communityList: input.currentCommunitySourceName },
    ));
    if (!communitySetMatch.matched) {
      findings.push(makeFinding(
        "TARGET_POLICY_USES_SHARED_COMMUNITY_LIST",
        "warning",
        "community_set",
        "Target usa community-list compartilhada e o preview não conseguiu preservar o set exato.",
        { communityList: input.currentCommunitySourceName },
      ));
    }
  }

  if (!useCommunityList) {
    findings.push(makeFinding(
      "PREVIEW_USES_DIRECT_COMMUNITIES",
      "info",
      "cell",
      "Preview vai usar communities diretas.",
      { evidence: { desiredCommunities } },
    ));
  }

  if (input.currentCommunitySourceType === "unknown") {
    findings.push(makeFinding(
      "PREVIEW_ROLLBACK_LOW_CONFIDENCE",
      "warning",
      "target",
      "Rollback com baixa confiança porque a origem observada não está clara.",
    ));
  }

  const proposedCommunities = useCommunityList && communitySetMatch.communityListName
    ? communitySetMatch.communities
    : desiredCommunities;
  const commandConfidence: "high" | "medium" | "low" = useCommunityList ? "high" : input.currentCommunitySourceType === "unknown" ? "low" : "medium";
  const proposedCommands = buildCommands(
    input.targetPolicyName,
    input.node,
    proposedCommunities,
    useCommunityList ? "community_list" : "direct",
    useCommunityList ? communitySetMatch.communityListName ?? null : null,
    commandConfidence,
  );
  const rollbackCommands = buildRollbackCommands(
    input.targetPolicyName,
    input.node,
    currentCommunities,
    input.currentCommunitySourceType === "community_list" ? "community_list" : "direct",
    input.currentCommunitySourceName,
    input.currentCommunitySourceType === "unknown" ? "low" : "medium",
  );
  const diff: AnnouncementPreviewDiff = {
    removedCommunities: [...new Set(removedCommunities)],
    addedCommunities: input.desiredState === "Clear" ? [] : (desiredCommunity ? [desiredCommunity] : []),
    preservedCommunities: [...new Set(preservedCommunities)],
    oldState: input.currentState,
    newState: input.desiredState,
  };
  const rollbackDiff: AnnouncementPreviewDiff = {
    removedCommunities: input.desiredState === "Clear" ? [] : (desiredCommunity ? [desiredCommunity] : []),
    addedCommunities: [...new Set(currentCircuitCommunities.length > 0 ? currentCircuitCommunities : input.currentCommunity ? [input.currentCommunity] : [])],
    preservedCommunities: [...new Set(preservedCommunities)],
    oldState: input.desiredState,
    newState: input.currentState,
  };
  return {
    baseSnapshotId: input.baseSnapshotId,
    deviceId: input.deviceId,
    collectionId: input.collectionId,
    targetPolicyName: input.targetPolicyName,
    targetType: input.targetType,
    node: input.node,
    upstreamCircuitId: input.upstreamCircuitId,
    upstreamName: input.upstreamName,
    prefixScope: input.prefixScope,
    currentState: input.currentState,
    desiredState: input.desiredState,
    currentCommunity: input.currentCommunity,
    desiredCommunity,
    currentCommunitySourceType: input.currentCommunitySourceType,
    currentCommunitySourceName: input.currentCommunitySourceName,
    currentCommunities,
    desiredCommunities,
    communitySetMatch,
    diff,
    proposedCommands,
    rollbackCommands,
    rollbackDiff,
    rollbackSource: input.baseSnapshotId,
    riskLevel: summarizeRisk(findings, false),
    findings,
    status: "preview_only",
    commandConfidence,
    note: input.note ?? null,
  };
}

export async function compileAnnouncementPreview(input: AnnouncementPreviewInput): Promise<AnnouncementPreviewResult | { error: string; status: number; code?: string }> {
  const { db, devicesTable } = await import("@workspace/db");
  const [device] = await db.select({ id: devicesTable.id }).from(devicesTable).where(eq(devicesTable.id, input.deviceId)).limit(1);
  if (!device) {
    return { error: "Device not found", status: 404, code: "DEVICE_NOT_FOUND" };
  }

  if (await hasRefreshInProgress(input.deviceId)) {
    return { error: "Refresh em andamento para este device", status: 409, code: "REFRESH_IN_PROGRESS" };
  }

  const baseSnapshot = await loadBaseSnapshotOrError(input.deviceId, input.baseSnapshotId);
  if (!baseSnapshot.ok) {
    return { error: baseSnapshot.message, status: baseSnapshot.status, code: baseSnapshot.error };
  }

  const graphInput = await loadAnnouncementGraphInput(input.deviceId);
  if (!graphInput) {
    return { error: "Announcement context indisponível", status: 404, code: "SNAPSHOT_NOT_FOUND" };
  }

  const graph = buildAnnouncementGraph({
    rawConfig: graphInput.rawConfig,
    localAs: graphInput.localAs,
    routePolicies: graphInput.routePolicies,
    bgpPeers: graphInput.bgpPeers,
  });

  const classifications = graph.classifications;
  const targetClassification = classifications.find((classification) => classification.policyName.toLowerCase() === input.targetPolicyName.toLowerCase()) ?? null;
  if (!targetClassification) {
    return { error: "Target não encontrado no snapshot", status: 404, code: "TARGET_NOT_FOUND_IN_SNAPSHOT" };
  }
  if (!targetClassification.includeInAnnouncementMatrix) {
    if (targetClassification.policyType === "customer_export") {
      return { error: "Target é export", status: 409, code: "TARGET_IS_EXPORT_POLICY" };
    }
    if (targetClassification.policyType === "upstream_export_audit" || targetClassification.policyType === "upstream_import_audit") {
      return { error: "Target é upstream audit-only", status: 409, code: "TARGET_IS_UPSTREAM_AUDIT_ONLY" };
    }
    return { error: "Target não modificável", status: 409, code: "TARGET_NOT_MODIFIABLE" };
  }

  const snapshotRows = baseSnapshot.snapshot.matrixJson.rows as AnnouncementMatrixRow[];
  const row = snapshotRows.find(
    (item) => item.targetPolicyName.toLowerCase() === input.targetPolicyName.toLowerCase() && item.targetType === targetClassification.policyType,
  ) ?? snapshotRows.find((item) => item.targetPolicyName.toLowerCase() === input.targetPolicyName.toLowerCase()) ?? null;

  if (!row) {
    return { error: "Target não encontrado no snapshot", status: 404, code: "TARGET_NOT_FOUND_IN_SNAPSHOT" };
  }
  if (row.node == null) {
    return { error: "Target sem node claro", status: 409, code: "TARGET_NOT_MODIFIABLE" };
  }

  const selectedCircuitId = input.upstreamCircuitId.trim();
  const currentCell = row.cells[selectedCircuitId] ?? null;
  if (!currentCell) {
    return { error: "Upstream não encontrado no snapshot", status: 404, code: "UPSTREAM_NOT_FOUND_IN_SNAPSHOT" };
  }

  const desiredState = parseDesiredState(input.desiredState);
  if (!desiredState) {
    return { error: "desiredState inválido", status: 400, code: "INVALID_DESIRED_STATE" };
  }
  const current = rowToCurrentCommunities(row, selectedCircuitId);
  const simulation = simulateAnnouncementPreview({
    baseSnapshotId: baseSnapshot.snapshot.id,
    deviceId: input.deviceId,
    collectionId: baseSnapshot.snapshot.collectionId,
    targetPolicyName: row.targetPolicyName,
    targetType: row.targetType as AnnouncementMatrixTargetType,
    node: row.node,
    upstreamCircuitId: selectedCircuitId,
    upstreamName: currentCell.upstreamName,
    prefixScope: row.prefixScope,
    currentState: currentCell.label ?? currentCell.state ?? "—",
    desiredState,
    currentCommunity: currentCell.community ?? null,
    currentCommunitySourceType: current.currentCell?.communitySourceType ?? "unknown",
    currentCommunitySourceName: current.currentCell?.communitySourceName ?? null,
    currentCommunities: current.communities,
    communitySets: buildAnnouncementCommunitySetLibrary(graphInput.rawConfig),
    note: input.note?.trim() ? input.note.trim() : null,
  });

  return {
    previewId: encodePreviewToken(simulation),
    ...simulation,
  };
}

export async function createAnnouncementChangePlanDraft(input: { previewId: string; note?: string | null; requestedBy?: number | null }): Promise<AnnouncementChangePlanRecord | { error: string; status: number }> {
  const { bgpAnnouncementChangePlansTable, db, devicesTable } = await import("@workspace/db");
  const preview = decodePreviewToken(input.previewId);
  if (!preview) {
    return { error: "previewId inválido", status: 400 };
  }

  const [device] = await db.select({ id: devicesTable.id }).from(devicesTable).where(eq(devicesTable.id, preview.deviceId)).limit(1);
  if (!device) {
    return { error: "Device not found", status: 404 };
  }

  const record = {
    deviceId: preview.deviceId,
    baseSnapshotId: preview.baseSnapshotId,
    collectionId: preview.collectionId,
    previewId: input.previewId,
    targetPolicyName: preview.targetPolicyName,
    targetType: preview.targetType,
    node: preview.node,
    upstreamCircuitId: preview.upstreamCircuitId,
    upstreamName: preview.upstreamName,
    currentState: preview.currentState,
    desiredState: preview.desiredState,
    currentCommunity: preview.currentCommunity,
    desiredCommunity: preview.desiredCommunity,
    diffJson: preview.diff,
    proposedCommandsJson: preview.proposedCommands,
    rollbackCommandsJson: preview.rollbackCommands,
    findingsJson: [
      ...preview.findings,
      makeFinding("CHANGE_PLAN_DRAFT_CREATED", "info", "snapshot", "Change-plan draft criado."),
    ],
    riskLevel: preview.riskLevel,
    status: "draft" as AnnouncementChangePlanStatus,
    note: input.note?.trim() ? input.note.trim() : preview.note,
    postcheckRequired: true,
    postcheckStatus: "pending",
    previewJson: preview,
    createdBy: input.requestedBy ?? null,
  };

  const [inserted] = await db
    .insert(bgpAnnouncementChangePlansTable)
    .values({
      ...record,
      updatedAt: new Date(),
    })
    .returning();
  if (!inserted) {
    return { error: "Failed to create change-plan draft", status: 500 };
  }

  return {
    id: inserted.id,
    deviceId: inserted.deviceId,
    baseSnapshotId: inserted.baseSnapshotId,
    collectionId: inserted.collectionId,
    previewId: inserted.previewId,
    targetPolicyName: inserted.targetPolicyName,
    targetType: inserted.targetType,
    node: inserted.node,
    upstreamCircuitId: inserted.upstreamCircuitId,
    upstreamName: inserted.upstreamName,
    currentState: inserted.currentState,
    desiredState: inserted.desiredState,
    currentCommunity: inserted.currentCommunity,
    desiredCommunity: inserted.desiredCommunity,
    diff: inserted.diffJson as AnnouncementPreviewDiff,
    proposedCommands: inserted.proposedCommandsJson as AnnouncementPreviewCommand[],
    rollbackCommands: inserted.rollbackCommandsJson as AnnouncementPreviewCommand[],
    findings: inserted.findingsJson as AnnouncementFinding[],
    riskLevel: inserted.riskLevel as AnnouncementChangePlanRecord["riskLevel"],
    status: inserted.status as AnnouncementChangePlanStatus,
    note: inserted.note ?? null,
    preview: { previewId: inserted.previewId, ...(inserted.previewJson as Omit<AnnouncementPreviewResult, "previewId">) } as AnnouncementPreviewResult,
    createdBy: inserted.createdBy,
    createdAt: inserted.createdAt.toISOString(),
    updatedAt: inserted.updatedAt.toISOString(),
    postcheckRequired: inserted.postcheckRequired ?? true,
    postcheckStatus: inserted.postcheckStatus ?? "pending",
  };
}

export async function listAnnouncementChangePlans(deviceId: number): Promise<AnnouncementChangePlanRecord[]> {
  const { bgpAnnouncementChangePlansTable, db } = await import("@workspace/db");
  const rows = await db
    .select()
    .from(bgpAnnouncementChangePlansTable)
    .where(eq(bgpAnnouncementChangePlansTable.deviceId, deviceId))
    .orderBy(desc(bgpAnnouncementChangePlansTable.createdAt))
    .limit(100);
  return rows.map((row) => ({
    id: row.id,
    deviceId: row.deviceId,
    baseSnapshotId: row.baseSnapshotId,
    collectionId: row.collectionId,
    previewId: row.previewId,
    targetPolicyName: row.targetPolicyName,
    targetType: row.targetType,
    node: row.node,
    upstreamCircuitId: row.upstreamCircuitId,
    upstreamName: row.upstreamName,
    currentState: row.currentState,
    desiredState: row.desiredState,
    currentCommunity: row.currentCommunity,
    desiredCommunity: row.desiredCommunity,
    diff: row.diffJson as AnnouncementPreviewDiff,
    proposedCommands: row.proposedCommandsJson as AnnouncementPreviewCommand[],
    rollbackCommands: row.rollbackCommandsJson as AnnouncementPreviewCommand[],
    findings: row.findingsJson as AnnouncementFinding[],
    riskLevel: row.riskLevel as AnnouncementChangePlanRecord["riskLevel"],
    status: row.status as AnnouncementChangePlanStatus,
    note: row.note ?? null,
    preview: { previewId: row.previewId, ...(row.previewJson as Omit<AnnouncementPreviewResult, "previewId">) } as AnnouncementPreviewResult,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    postcheckRequired: row.postcheckRequired ?? true,
    postcheckStatus: row.postcheckStatus ?? "pending",
  }));
}

export async function getAnnouncementChangePlan(changePlanId: number): Promise<AnnouncementChangePlanRecord | null> {
  const { bgpAnnouncementChangePlansTable, db } = await import("@workspace/db");
  const [row] = await db
    .select()
    .from(bgpAnnouncementChangePlansTable)
    .where(eq(bgpAnnouncementChangePlansTable.id, changePlanId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    deviceId: row.deviceId,
    baseSnapshotId: row.baseSnapshotId,
    collectionId: row.collectionId,
    previewId: row.previewId,
    targetPolicyName: row.targetPolicyName,
    targetType: row.targetType,
    node: row.node,
    upstreamCircuitId: row.upstreamCircuitId,
    upstreamName: row.upstreamName,
    currentState: row.currentState,
    desiredState: row.desiredState,
    currentCommunity: row.currentCommunity,
    desiredCommunity: row.desiredCommunity,
    diff: row.diffJson as AnnouncementPreviewDiff,
    proposedCommands: row.proposedCommandsJson as AnnouncementPreviewCommand[],
    rollbackCommands: row.rollbackCommandsJson as AnnouncementPreviewCommand[],
    findings: row.findingsJson as AnnouncementFinding[],
    riskLevel: row.riskLevel as AnnouncementChangePlanRecord["riskLevel"],
    status: row.status as AnnouncementChangePlanStatus,
    note: row.note ?? null,
    preview: { previewId: row.previewId, ...(row.previewJson as Omit<AnnouncementPreviewResult, "previewId">) } as AnnouncementPreviewResult,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    postcheckRequired: row.postcheckRequired ?? true,
    postcheckStatus: row.postcheckStatus ?? "pending",
  };
}

export async function cancelAnnouncementChangePlan(changePlanId: number): Promise<AnnouncementChangePlanRecord | null> {
  const { bgpAnnouncementChangePlansTable, db } = await import("@workspace/db");
  const [row] = await db
    .update(bgpAnnouncementChangePlansTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(bgpAnnouncementChangePlansTable.id, changePlanId))
    .returning();
  if (!row) return null;
  return {
    id: row.id,
    deviceId: row.deviceId,
    baseSnapshotId: row.baseSnapshotId,
    collectionId: row.collectionId,
    previewId: row.previewId,
    targetPolicyName: row.targetPolicyName,
    targetType: row.targetType,
    node: row.node,
    upstreamCircuitId: row.upstreamCircuitId,
    upstreamName: row.upstreamName,
    currentState: row.currentState,
    desiredState: row.desiredState,
    currentCommunity: row.currentCommunity,
    desiredCommunity: row.desiredCommunity,
    diff: row.diffJson as AnnouncementPreviewDiff,
    proposedCommands: row.proposedCommandsJson as AnnouncementPreviewCommand[],
    rollbackCommands: row.rollbackCommandsJson as AnnouncementPreviewCommand[],
    findings: row.findingsJson as AnnouncementFinding[],
    riskLevel: row.riskLevel as AnnouncementChangePlanRecord["riskLevel"],
    status: row.status as AnnouncementChangePlanStatus,
    note: row.note ?? null,
    preview: { previewId: row.previewId, ...(row.previewJson as Omit<AnnouncementPreviewResult, "previewId">) } as AnnouncementPreviewResult,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    postcheckRequired: row.postcheckRequired ?? true,
    postcheckStatus: row.postcheckStatus ?? "pending",
  };
}

export function parseAnnouncementPreviewRequest(body: Record<string, unknown>): AnnouncementPreviewInput | null {
  const baseSnapshotId = Number(body.baseSnapshotId);
  const deviceId = Number(body.deviceId);
  const targetPolicyName = typeof body.targetPolicyName === "string" ? body.targetPolicyName.trim() : "";
  const node = Number(body.node);
  const upstreamCircuitId = typeof body.upstreamCircuitId === "string" ? body.upstreamCircuitId.trim() : "";
  const desiredState = parseDesiredState(body.desiredState);
  if (!Number.isInteger(baseSnapshotId) || baseSnapshotId < 1) return null;
  if (!Number.isInteger(deviceId) || deviceId < 1) return null;
  if (!targetPolicyName) return null;
  if (!Number.isInteger(node)) return null;
  if (!upstreamCircuitId) return null;
  if (!desiredState) return null;
  return {
    baseSnapshotId,
    deviceId,
    targetPolicyName,
    node,
    upstreamCircuitId,
    desiredState,
    note: typeof body.note === "string" ? body.note : null,
  };
}

export function parseAnnouncementChangePlanCreateInput(body: Record<string, unknown>): { previewId: string; note: string | null } | null {
  const previewId = typeof body.previewId === "string" ? body.previewId.trim() : "";
  if (!previewId) return null;
  return {
    previewId,
    note: typeof body.note === "string" ? body.note : null,
  };
}

export function decodeAnnouncementPreview(previewId: string): Omit<AnnouncementPreviewResult, "previewId"> | null {
  return decodePreviewToken(previewId);
}

export function encodeAnnouncementPreview(preview: Omit<AnnouncementPreviewResult, "previewId">): string {
  return encodePreviewToken(preview);
}

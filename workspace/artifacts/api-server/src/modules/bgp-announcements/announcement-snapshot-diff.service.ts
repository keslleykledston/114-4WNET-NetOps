import type {
  AnnouncementSnapshotDiffResponse,
  DependencyScope,
  MatrixResponse,
  MatrixRow,
  ProtectedGlobalDependency,
  SnapshotDiffChange,
  SnapshotDiffChangeType,
  SnapshotDiffSnapshotRef,
  SnapshotDiffSummary,
  SnapshotTimelineEntry,
  SnapshotTimelineResponse,
  TargetRole,
} from "./bgp-announcement.types.js";
import { getMatrixSnapshotById, listMatrixSnapshotSummaries } from "./announcement-matrix.service.js";
import { loadMatrixSnapshotById } from "./announcement-matrix-snapshot.service.js";
import { deriveRowSemanticsForLegacySnapshot } from "./services/semantic-matrix-view.service.js";
import { isProtectedGlobalDependency } from "./resolvers/semantic-dependency-classifier.js";

export type SnapshotDiffResult =
  | AnnouncementSnapshotDiffResponse
  | "base_not_found"
  | "compare_not_found"
  | "cross_device"
  | "incompatible";

function snapshotRef(matrix: MatrixResponse): SnapshotDiffSnapshotRef {
  const counters = matrix.meta?.counters;
  return {
    id: matrix.meta?.snapshotId ?? 0,
    deviceId: matrix.deviceId,
    createdAt: matrix.meta?.snapshotCreatedAt ?? matrix.generatedAt,
    rowCount: counters?.rowCount ?? matrix.rows.length,
    status: matrix.meta?.status ?? "ok",
    conflictCount: counters?.conflictCount ?? matrix.semanticView?.realConflicts.length ?? 0,
  };
}

function normalizeRow(row: MatrixRow): MatrixRow {
  return deriveRowSemanticsForLegacySnapshot(row);
}

function rowFlags(row: MatrixRow) {
  const editMode = row.targetEditMode ?? "unknown";
  return {
    isEditableTarget: editMode === "editable_future",
    isAuditOnly: editMode === "audit_only",
    isProtectedGlobal: row.dependencyProtection === "protected_global"
      || isProtectedGlobalDependency(row.prefixListName ?? row.prefixScope, "prefix-list"),
  };
}

function cellsSignature(row: MatrixRow): string {
  return row.cells
    .map((cell) => `${cell.circuitId}:${cell.state}:${cell.community ?? ""}:${cell.prependCount ?? ""}`)
    .sort()
    .join("|");
}

function communitySet(row: MatrixRow): Set<string> {
  const values = new Set<string>();
  for (const cell of row.cells) {
    if (cell.community) values.add(cell.community);
  }
  return values;
}

function severityForType(type: SnapshotDiffChangeType, row?: MatrixRow): SnapshotDiffChange["severity"] {
  if (type === "conflict_added") return "critical";
  if (type === "protected_global_removed") return "critical";
  if (type === "conflict_changed" || type === "target_changed") {
    return row && rowFlags(row).isEditableTarget ? "warning" : "info";
  }
  return "info";
}

function makeChange(input: {
  type: SnapshotDiffChangeType;
  row?: MatrixRow | null;
  before: unknown;
  after: unknown;
  explanation: string;
  targetId?: string | null;
  targetName?: string | null;
}): SnapshotDiffChange {
  const row = input.row ?? null;
  const flags = row ? rowFlags(row) : {
    isEditableTarget: false,
    isAuditOnly: false,
    isProtectedGlobal: input.type.startsWith("protected_global_"),
  };
  return {
    type: input.type,
    severity: severityForType(input.type, row ?? undefined),
    targetId: input.targetId ?? row?.targetKey ?? null,
    targetName: input.targetName ?? row?.routePolicyName ?? null,
    targetRole: row?.targetRole ?? null,
    targetEditMode: row?.targetEditMode ?? null,
    before: input.before,
    after: input.after,
    explanation: input.explanation,
    isEditableTarget: flags.isEditableTarget,
    isProtectedGlobal: flags.isProtectedGlobal,
    isAuditOnly: flags.isAuditOnly,
  };
}

function diffTargets(baseRows: MatrixRow[], compareRows: MatrixRow[]): SnapshotDiffChange[] {
  const changes: SnapshotDiffChange[] = [];
  const baseMap = new Map(baseRows.map((row) => [row.targetKey, row]));
  const compareMap = new Map(compareRows.map((row) => [row.targetKey, row]));

  for (const [, compareRow] of compareMap) {
    const baseRow = baseMap.get(compareRow.targetKey);
    if (!baseRow) {
      changes.push(makeChange({
        type: "target_added",
        row: compareRow,
        before: null,
        after: { routePolicyName: compareRow.routePolicyName, cells: compareRow.cells },
        explanation: `Target ${compareRow.routePolicyName} apareceu no snapshot mais recente.`,
      }));
      continue;
    }

    const baseSig = cellsSignature(baseRow);
    const compareSig = cellsSignature(compareRow);
    const prefixesChanged = JSON.stringify(baseRow.affectedPrefixes) !== JSON.stringify(compareRow.affectedPrefixes);

    if (baseSig !== compareSig || prefixesChanged) {
      const flags = rowFlags(compareRow);
      let type: SnapshotDiffChangeType = "target_changed";
      if (flags.isAuditOnly) type = "upstream_audit_changed";
      else if (flags.isProtectedGlobal) type = "protected_global_changed";

      changes.push(makeChange({
        type,
        row: compareRow,
        before: { cells: baseRow.cells, prefixes: baseRow.affectedPrefixes },
        after: { cells: compareRow.cells, prefixes: compareRow.affectedPrefixes },
        explanation: flags.isAuditOnly
          ? `Mudança de auditoria upstream em ${compareRow.routePolicyName} — somente leitura.`
          : flags.isEditableTarget
            ? `Target Cliente/ORIGIN ${compareRow.routePolicyName} alterou marcações ou prefixos — elegível para análise futura, sem ação automática.`
            : `Target ${compareRow.routePolicyName} alterou estado ou prefixos.`,
      }));
    }
  }

  for (const [, baseRow] of baseMap) {
    if (!compareMap.has(baseRow.targetKey)) {
      changes.push(makeChange({
        type: "target_removed",
        row: baseRow,
        before: { routePolicyName: baseRow.routePolicyName, cells: baseRow.cells },
        after: null,
        explanation: `Target ${baseRow.routePolicyName} não está presente no snapshot mais recente.`,
      }));
    }
  }

  return changes;
}

function diffCommunities(baseRows: MatrixRow[], compareRows: MatrixRow[]): SnapshotDiffChange[] {
  const changes: SnapshotDiffChange[] = [];
  const keys = new Set([...baseRows.map((r) => r.targetKey), ...compareRows.map((r) => r.targetKey)]);
  const baseMap = new Map(baseRows.map((row) => [row.targetKey, row]));
  const compareMap = new Map(compareRows.map((row) => [row.targetKey, row]));

  for (const key of keys) {
    const baseRow = baseMap.get(key);
    const compareRow = compareMap.get(key);
    if (!baseRow || !compareRow) continue;

    const baseCommunities = communitySet(baseRow);
    const compareCommunities = communitySet(compareRow);

    for (const community of compareCommunities) {
      if (!baseCommunities.has(community)) {
        changes.push(makeChange({
          type: "community_added",
          row: compareRow,
          before: null,
          after: community,
          explanation: `Community ${community} adicionada em ${compareRow.routePolicyName}.`,
        }));
      }
    }

    for (const community of baseCommunities) {
      if (!compareCommunities.has(community)) {
        changes.push(makeChange({
          type: "community_removed",
          row: compareRow,
          before: community,
          after: null,
          explanation: `Community ${community} removida de ${compareRow.routePolicyName}.`,
        }));
      }
    }

    for (const cell of compareRow.cells) {
      const baseCell = baseRow.cells.find((c) => c.circuitId === cell.circuitId);
      if (!baseCell || !baseCell.community || !cell.community) continue;
      if (baseCell.community !== cell.community) {
        changes.push(makeChange({
          type: "community_changed",
          row: compareRow,
          before: { circuitId: cell.circuitId, community: baseCell.community },
          after: { circuitId: cell.circuitId, community: cell.community },
          explanation: `Community do circuito ${cell.circuitId} em ${compareRow.routePolicyName}: ${baseCell.community} → ${cell.community}.`,
        }));
      }
    }
  }

  return changes;
}

function diffPolicies(baseRows: MatrixRow[], compareRows: MatrixRow[]): SnapshotDiffChange[] {
  const changes: SnapshotDiffChange[] = [];
  const baseNames = new Set(baseRows.map((r) => r.routePolicyName));
  const compareNames = new Set(compareRows.map((r) => r.routePolicyName));

  for (const name of compareNames) {
    if (!baseNames.has(name)) {
      const row = compareRows.find((r) => r.routePolicyName === name);
      changes.push(makeChange({
        type: "policy_added",
        row: row ?? null,
        targetName: name,
        before: null,
        after: name,
        explanation: `Route-policy ${name} passou a compor a matriz.`,
      }));
    }
  }

  for (const name of baseNames) {
    if (!compareNames.has(name)) {
      const row = baseRows.find((r) => r.routePolicyName === name);
      changes.push(makeChange({
        type: "policy_removed",
        row: row ?? null,
        targetName: name,
        before: name,
        after: null,
        explanation: `Route-policy ${name} deixou de compor a matriz.`,
      }));
    }
  }

  return changes;
}

function protectedGlobalKey(item: ProtectedGlobalDependency): string {
  return `${item.objectKind}:${item.objectName}`;
}

function diffProtectedGlobals(base: MatrixResponse, compare: MatrixResponse): SnapshotDiffChange[] {
  const changes: SnapshotDiffChange[] = [];
  const baseItems = base.semanticView?.protectedGlobals ?? [];
  const compareItems = compare.semanticView?.protectedGlobals ?? [];
  const baseMap = new Map(baseItems.map((item) => [protectedGlobalKey(item), item]));
  const compareMap = new Map(compareItems.map((item) => [protectedGlobalKey(item), item]));

  for (const [, item] of compareMap) {
    if (!baseMap.has(protectedGlobalKey(item))) {
      changes.push(makeChange({
        type: "protected_global_added",
        before: null,
        after: item,
        targetId: item.objectName,
        targetName: item.objectName,
        explanation: `Objeto global protegido ${item.objectName} passou a ser rastreado — não sugerir remoção automática.`,
      }));
    } else if (JSON.stringify(baseMap.get(protectedGlobalKey(item))) !== JSON.stringify(item)) {
      changes.push(makeChange({
        type: "protected_global_changed",
        before: baseMap.get(protectedGlobalKey(item)),
        after: item,
        targetId: item.objectName,
        targetName: item.objectName,
        explanation: `Objeto global protegido ${item.objectName} alterou metadados ou consumidores — permanece protegido.`,
      }));
    }
  }

  for (const [, item] of baseMap) {
    if (!compareMap.has(protectedGlobalKey(item))) {
      changes.push(makeChange({
        type: "protected_global_removed",
        before: item,
        after: null,
        targetId: item.objectName,
        targetName: item.objectName,
        explanation: `Objeto global protegido ${item.objectName} não aparece no snapshot mais recente — revisar manualmente; sem remoção automática.`,
      }));
    }
  }

  return changes;
}

function conflictKey(item: { targetKey: string; circuitIds: string[] }): string {
  return `${item.targetKey}:${[...item.circuitIds].sort().join(",")}`;
}

function diffConflicts(base: MatrixResponse, compare: MatrixResponse): SnapshotDiffChange[] {
  const changes: SnapshotDiffChange[] = [];
  const baseConflicts = base.semanticView?.realConflicts ?? [];
  const compareConflicts = compare.semanticView?.realConflicts ?? [];
  const baseMap = new Map(baseConflicts.map((item) => [conflictKey(item), item]));
  const compareMap = new Map(compareConflicts.map((item) => [conflictKey(item), item]));
  const rowMap = new Map(compare.rows.map((row) => [row.targetKey, row]));

  for (const [, item] of compareMap) {
    const row = rowMap.get(item.targetKey);
    if (!baseMap.has(conflictKey(item))) {
      changes.push(makeChange({
        type: "conflict_added",
        row: row ?? null,
        before: null,
        after: item,
        targetId: item.targetKey,
        targetName: item.routePolicyName,
        explanation: item.message,
      }));
    } else if (JSON.stringify(baseMap.get(conflictKey(item))) !== JSON.stringify(item)) {
      changes.push(makeChange({
        type: "conflict_changed",
        row: row ?? null,
        before: baseMap.get(conflictKey(item)),
        after: item,
        targetId: item.targetKey,
        targetName: item.routePolicyName,
        explanation: `Conflito alterado em ${item.routePolicyName}.`,
      }));
    }
  }

  for (const [, item] of baseMap) {
    if (!compareMap.has(conflictKey(item))) {
      changes.push(makeChange({
        type: "conflict_resolved",
        row: rowMap.get(item.targetKey) ?? null,
        before: item,
        after: null,
        targetId: item.targetKey,
        targetName: item.routePolicyName,
        explanation: `Conflito resolvido em ${item.routePolicyName}.`,
      }));
    }
  }

  return changes;
}

function diffMetadata(base: MatrixResponse, compare: MatrixResponse): SnapshotDiffChange[] {
  const before = {
    status: base.meta?.status,
    counters: base.meta?.counters,
    warnings: base.meta?.warnings ?? [],
  };
  const after = {
    status: compare.meta?.status,
    counters: compare.meta?.counters,
    warnings: compare.meta?.warnings ?? [],
  };
  if (JSON.stringify(before) === JSON.stringify(after)) return [];

  return [makeChange({
    type: "metadata_changed",
    before,
    after,
    explanation: "Metadados do snapshot (contadores, status ou warnings) alteraram entre comparações.",
  })];
}

function buildSummary(changes: SnapshotDiffChange[]): SnapshotDiffSummary {
  return {
    addedTargets: changes.filter((c) => c.type === "target_added").length,
    removedTargets: changes.filter((c) => c.type === "target_removed").length,
    changedTargets: changes.filter((c) => c.type === "target_changed").length,
    addedCommunities: changes.filter((c) => c.type === "community_added").length,
    removedCommunities: changes.filter((c) => c.type === "community_removed").length,
    newConflicts: changes.filter((c) => c.type === "conflict_added").length,
    resolvedConflicts: changes.filter((c) => c.type === "conflict_resolved").length,
    protectedGlobalChanges: changes.filter((c) => c.type.startsWith("protected_global_")).length,
    upstreamAuditChanges: changes.filter((c) => c.type === "upstream_audit_changed").length,
  };
}

function aggregateByRole(changes: SnapshotDiffChange[]): Partial<Record<TargetRole, number>> {
  const out: Partial<Record<TargetRole, number>> = {};
  for (const change of changes) {
    if (!change.targetRole) continue;
    out[change.targetRole] = (out[change.targetRole] ?? 0) + 1;
  }
  return out;
}

function aggregateByScope(rows: MatrixRow[]): Partial<Record<DependencyScope, number>> {
  const out: Partial<Record<DependencyScope, number>> = {};
  for (const row of rows) {
    const scope = row.dependencyScope ?? "unknown";
    out[scope] = (out[scope] ?? 0) + 1;
  }
  return out;
}

function buildRiskHints(changes: SnapshotDiffChange[]): string[] {
  const hints: string[] = [];
  if (changes.some((c) => c.type === "conflict_added")) {
    hints.push("Novos conflitos detectados — revisar aba Conflitos antes de qualquer preview.");
  }
  if (changes.some((c) => c.isEditableTarget && (c.type === "target_changed" || c.type.startsWith("community_")))) {
    hints.push("Targets Cliente/ORIGIN alteraram — candidatos a Change Preview manual, sem geração automática.");
  }
  if (changes.some((c) => c.type.startsWith("protected_global_"))) {
    hints.push("Objetos globais protegidos mudaram — nunca sugerir remoção automática.");
  }
  if (changes.some((c) => c.isAuditOnly)) {
    hints.push("Mudanças em upstreams são auditoria read-only — não elegíveis a preview nesta fase.");
  }
  hints.push("Comparação read-only — não cria preview nem change plan.");
  return hints;
}

export function computeAnnouncementSnapshotDiff(
  baseMatrix: MatrixResponse,
  compareMatrix: MatrixResponse,
): AnnouncementSnapshotDiffResponse {
  const baseRows = baseMatrix.rows.map(normalizeRow);
  const compareRows = compareMatrix.rows.map(normalizeRow);

  const changes: SnapshotDiffChange[] = [
    ...diffTargets(baseRows, compareRows),
    ...diffCommunities(baseRows, compareRows),
    ...diffPolicies(baseRows, compareRows),
    ...diffProtectedGlobals(baseMatrix, compareMatrix),
    ...diffConflicts(baseMatrix, compareMatrix),
    ...diffMetadata(baseMatrix, compareMatrix),
  ];

  return {
    baseSnapshot: snapshotRef(baseMatrix),
    compareSnapshot: snapshotRef(compareMatrix),
    summary: buildSummary(changes),
    changes,
    byTargetRole: aggregateByRole(changes),
    byDependencyScope: aggregateByScope(compareRows),
    riskHints: buildRiskHints(changes),
    readOnly: true,
  };
}

export async function diffAnnouncementSnapshots(
  baseSnapshotId: number,
  compareSnapshotId: number,
): Promise<SnapshotDiffResult> {
  const [baseRow, compareRow] = await Promise.all([
    loadMatrixSnapshotById(baseSnapshotId),
    loadMatrixSnapshotById(compareSnapshotId),
  ]);

  if (!baseRow) return "base_not_found";
  if (!compareRow) return "compare_not_found";
  if (baseRow.deviceId !== compareRow.deviceId) return "cross_device";

  const [baseMatrix, compareMatrix] = await Promise.all([
    getMatrixSnapshotById(baseSnapshotId),
    getMatrixSnapshotById(compareSnapshotId),
  ]);

  if (baseMatrix === "snapshot_not_found" || baseMatrix === "snapshot_incompatible") return "incompatible";
  if (compareMatrix === "snapshot_not_found" || compareMatrix === "snapshot_incompatible") return "incompatible";

  return computeAnnouncementSnapshotDiff(baseMatrix, compareMatrix);
}

export async function diffSnapshotToLatest(snapshotId: number): Promise<SnapshotDiffResult | "no_latest"> {
  const baseRow = await loadMatrixSnapshotById(snapshotId);
  if (!baseRow) return "base_not_found";

  const summaries = await listMatrixSnapshotSummaries(baseRow.deviceId, 1);
  const latest = summaries[0];
  if (!latest) return "no_latest";
  if (latest.id === snapshotId) {
    const baseMatrix = await getMatrixSnapshotById(snapshotId);
    if (baseMatrix === "snapshot_not_found" || baseMatrix === "snapshot_incompatible") return "incompatible";
    return computeAnnouncementSnapshotDiff(baseMatrix, baseMatrix);
  }

  return diffAnnouncementSnapshots(snapshotId, latest.id);
}

export async function getAnnouncementSnapshotTimeline(deviceId: number, limit = 20): Promise<SnapshotTimelineResponse> {
  const snapshots = await listMatrixSnapshotSummaries(deviceId, limit);
  const entries: SnapshotTimelineEntry[] = snapshots.map((snapshot, index) => ({
    ...snapshot,
    isLatest: index === 0,
    previousSnapshotId: snapshots[index + 1]?.id ?? null,
  }));

  return { deviceId, snapshots: entries, readOnly: true };
}

export function snapshotDiffSafetyTokens(): string[] {
  return ["controlledExecution", "createAnnouncementChangePreview", "createChangePlan", "ssh2", "net-snmp", "connector"];
}

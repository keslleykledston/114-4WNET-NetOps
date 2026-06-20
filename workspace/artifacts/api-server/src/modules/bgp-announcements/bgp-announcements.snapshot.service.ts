import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import {
  bgpAnnouncementMatrixDiffsTable,
  bgpAnnouncementHistoryEventsTable,
  bgpAnnouncementMatrixSnapshotsTable,
  db,
  type BgpAnnouncementMatrixSnapshotRow,
} from "@workspace/db";
import type {
  AnnouncementFamilyScope,
  AnnouncementMatrixDiffSummary,
  AnnouncementMatrixCell,
  AnnouncementMatrixColumn,
  AnnouncementHistoryEvent,
  AnnouncementMatrixPayload,
  AnnouncementMatrixRow,
  AnnouncementMatrixSummaryPayload,
  AnnouncementSnapshotSource,
  AnnouncementMatrixDiffDetail,
} from "./bgp-announcements.types.js";

export interface CompactMatrixCell {
  circuitId: string;
  upstreamName: string;
  state: string;
}

export interface CompactMatrixRow {
  targetPolicyName?: string;
  routePolicyName: string;
  targetType: string;
  family: string;
  affectedPrefixes: string[];
  prefixScope?: string[];
  source?: AnnouncementSnapshotSource;
  confidence?: "high" | "medium" | "low";
  cells: CompactMatrixCell[];
}

export interface MatrixSnapshotView {
  id: number;
  deviceId: number;
  tenantId: number | null;
  collectionId: number | null;
  snapshotVersion: number;
  snapshotHash: string;
  isLatest: boolean;
  status: string;
  source: AnnouncementSnapshotSource;
  familyScope: AnnouncementFamilyScope;
  totalTargets: number;
  totalUpstreams: number;
  totalCells: number;
  totalFindings: number;
  totalCriticalFindings: number;
  matrixJson: AnnouncementMatrixPayload;
  summaryJson: AnnouncementMatrixSummaryPayload;
  filtersJson: Record<string, unknown>;
  generatedAt: string;
  createdAt: string;
  createdBy: number | null;
  rowsJson: CompactMatrixRow[];
}

function normalizeRows(rows: CompactMatrixRow[]): CompactMatrixRow[] {
  return rows.map((row) => ({
    routePolicyName: row.routePolicyName,
    targetType: row.targetType,
    family: row.family,
    affectedPrefixes: [...row.affectedPrefixes].sort((left, right) => left.localeCompare(right)),
    cells: [...row.cells].sort((left, right) =>
      left.upstreamName.localeCompare(right.upstreamName) || left.circuitId.localeCompare(right.circuitId)),
  })).sort((left, right) =>
    left.routePolicyName.localeCompare(right.routePolicyName) || left.family.localeCompare(right.family));
}

export function buildFoundationAnnouncementMatrixPayload(input?: {
  source?: AnnouncementSnapshotSource;
  rows?: CompactMatrixRow[];
  columns?: Array<Partial<AnnouncementMatrixColumn> & { key?: string; label?: string }>;
}): AnnouncementMatrixPayload {
  return {
    columns: (input?.columns ?? []).map((column) => ({
      key: column.key ?? column.upstreamCircuitId ?? column.label ?? "",
      label: column.label ?? column.upstreamName ?? column.key ?? column.upstreamCircuitId ?? "",
      upstreamCircuitId: column.upstreamCircuitId ?? column.key ?? column.label ?? "",
      upstreamName: column.upstreamName ?? column.label ?? column.key ?? column.upstreamCircuitId ?? "",
      role: column.role ?? null,
      source: column.source ?? input?.source ?? "foundation",
    })).filter((column) => Boolean(column.key)),
    rows: normalizeRows(input?.rows ?? []).map((row) => ({
      targetPolicyName: row.routePolicyName,
      routePolicyName: row.routePolicyName,
      targetType: row.targetType,
      family: row.family,
      prefixScope: {
        type: "unknown",
        name: row.routePolicyName,
        expandedPrefixes: [],
        affectedPrefixCount: 0,
        shared: null,
      },
      affectedPrefixes: row.affectedPrefixes,
      source: input?.source ?? "foundation",
      confidence: "medium",
      matrixState: {},
      findings: [],
      riskLevel: "foundation",
      cells: row.cells.reduce<Record<string, AnnouncementMatrixCell>>((acc, cell) => {
        acc[cell.circuitId] = {
          circuitId: cell.circuitId,
          upstreamName: cell.upstreamName,
          state: cell.state,
          label: cell.state,
          community: null,
          actionCode: null,
          note: null,
        };
        return acc;
      }, {}),
      risk: "foundation",
      node: null,
    })),
    generatedFrom: input?.source ?? "foundation",
    featureStatus: "foundation",
  };
}

export function buildFoundationAnnouncementSummary(matrix: AnnouncementMatrixPayload): AnnouncementMatrixSummaryPayload {
  const totalCells = matrix.rows.reduce((count, row) => count + Object.keys(row.cells).length, 0);
  const totalUpstreams = new Set(matrix.rows.flatMap((row) => Object.values(row.cells).map((cell) => `${cell.upstreamName}|${cell.circuitId}`))).size;
  return {
    totalTargets: matrix.rows.length,
    totalUpstreams,
    totalCells,
    totalFindings: 0,
    totalCriticalFindings: 0,
    note: "Foundation snapshot; resolver completo ainda pendente",
  };
}

export function computeAnnouncementSnapshotHash(matrix: AnnouncementMatrixPayload, summary: AnnouncementMatrixSummaryPayload): string {
  return createHash("sha256").update(JSON.stringify({ matrix, summary }), "utf8").digest("hex");
}

export function diffCompactMatrixRows(previousRows: CompactMatrixRow[], currentRows: CompactMatrixRow[]): {
  added: CompactMatrixRow[];
  removed: CompactMatrixRow[];
  changed: Array<{ key: string; routePolicyName: string; before: string; after: string }>;
} {
  const previousMap = new Map(previousRows.map((row) => [`${row.routePolicyName}|${row.family}`, row]));
  const currentMap = new Map(currentRows.map((row) => [`${row.routePolicyName}|${row.family}`, row]));

  const added: CompactMatrixRow[] = [];
  const removed: CompactMatrixRow[] = [];
  const changed: Array<{ key: string; routePolicyName: string; before: string; after: string }> = [];

  for (const [key, row] of currentMap) {
    const old = previousMap.get(key);
    if (!old) {
      added.push(row);
      continue;
    }
    if (JSON.stringify(old) !== JSON.stringify(row)) {
      changed.push({
        key,
        routePolicyName: row.routePolicyName,
        before: JSON.stringify(old),
        after: JSON.stringify(row),
      });
    }
  }

  for (const [key, row] of previousMap) {
    if (!currentMap.has(key)) {
      removed.push(row);
    }
  }

  return { added: normalizeRows(added), removed: normalizeRows(removed), changed };
}

export function compareAnnouncementMatrixPayloads(previous: AnnouncementMatrixPayload, current: AnnouncementMatrixPayload): AnnouncementMatrixDiffDetail {
  const previousMap = new Map(previous.rows.map((row) => [`${row.targetPolicyName}|${row.family}`, row]));
  const currentMap = new Map(current.rows.map((row) => [`${row.targetPolicyName}|${row.family}`, row]));
  const added: unknown[] = [];
  const removed: unknown[] = [];
  const changed: unknown[] = [];

  for (const [key, currentRow] of currentMap) {
    const previousRow = previousMap.get(key);
    if (!previousRow) {
      added.push({
        targetPolicyName: currentRow.targetPolicyName,
        targetType: currentRow.targetType,
        family: currentRow.family,
        node: currentRow.node ?? null,
        prefixScope: currentRow.prefixScope,
        cells: currentRow.cells,
        findings: currentRow.findings ?? [],
        riskLevel: currentRow.riskLevel ?? currentRow.risk,
      });
      continue;
    }

    const previousCells = previousRow.cells ?? {};
    const currentCells = currentRow.cells ?? {};
    const cellChanges: Array<Record<string, unknown>> = [];
    for (const circuitId of new Set([...Object.keys(previousCells), ...Object.keys(currentCells)])) {
      const before = previousCells[circuitId] ?? null;
      const after = currentCells[circuitId] ?? null;
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        cellChanges.push({
          circuitId,
          before,
          after,
        });
      }
    }

    const prevFindings = new Set((previousRow.findings ?? []).map((finding) => finding.code));
    const currFindings = new Set((currentRow.findings ?? []).map((finding) => finding.code));
    const findingsAdded = [...currFindings].filter((code) => !prevFindings.has(code));
    const findingsResolved = [...prevFindings].filter((code) => !currFindings.has(code));

    if (
      JSON.stringify(previousRow.prefixScope) !== JSON.stringify(currentRow.prefixScope)
      || JSON.stringify(previousRow.affectedPrefixes) !== JSON.stringify(currentRow.affectedPrefixes)
      || JSON.stringify(previousRow.findings ?? []) !== JSON.stringify(currentRow.findings ?? [])
      || JSON.stringify(previousRow.riskLevel ?? previousRow.risk) !== JSON.stringify(currentRow.riskLevel ?? currentRow.risk)
      || cellChanges.length > 0
    ) {
      changed.push({
        targetPolicyName: currentRow.targetPolicyName,
        routePolicyName: currentRow.routePolicyName,
        family: currentRow.family,
        targetType: currentRow.targetType,
        node: currentRow.node ?? null,
        prefixScopeChanged: JSON.stringify(previousRow.prefixScope) !== JSON.stringify(currentRow.prefixScope),
        affectedPrefixesChanged: JSON.stringify(previousRow.affectedPrefixes) !== JSON.stringify(currentRow.affectedPrefixes),
        cellChanges,
        findingsAdded,
        findingsResolved,
        riskBefore: previousRow.riskLevel ?? previousRow.risk,
        riskAfter: currentRow.riskLevel ?? currentRow.risk,
      });
    }
  }

  for (const [key, previousRow] of previousMap) {
    if (!currentMap.has(key)) {
      removed.push({
        targetPolicyName: previousRow.targetPolicyName,
        targetType: previousRow.targetType,
        family: previousRow.family,
        node: previousRow.node ?? null,
        prefixScope: previousRow.prefixScope,
        cells: previousRow.cells,
        findings: previousRow.findings ?? [],
        riskLevel: previousRow.riskLevel ?? previousRow.risk,
      });
    }
  }

  return {
    previousSnapshotId: 0,
    currentSnapshotId: 0,
    deviceId: 0,
    diffHash: createHash("sha256").update(JSON.stringify({ previous, current }), "utf8").digest("hex"),
    added,
    removed,
    changed,
    summary: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
    },
  } as AnnouncementMatrixDiffDetail;
}

export function compactRowsFromPayload(matrix: AnnouncementMatrixPayload): CompactMatrixRow[] {
  return matrix.rows.map((row) => ({
    targetPolicyName: row.targetPolicyName,
    routePolicyName: row.targetPolicyName ?? row.routePolicyName,
    targetType: row.targetType,
    family: row.family,
    affectedPrefixes: [...row.affectedPrefixes],
    prefixScope: row.prefixScope.expandedPrefixes.map((item) => item.prefix),
    source: row.source,
    confidence: row.confidence,
    cells: Object.values(row.cells).map((cell) => ({
      circuitId: cell.circuitId,
      upstreamName: cell.upstreamName,
      state: cell.state,
    })),
  }));
}

export function announcementDiffSummary(
  previousRows: CompactMatrixRow[],
  currentRows: CompactMatrixRow[],
): AnnouncementMatrixDiffSummary {
  const diff = diffCompactMatrixRows(previousRows, currentRows);
  return {
    added: diff.added.length,
    removed: diff.removed.length,
    changed: diff.changed.length,
  };
}

export function rowPassesFoundationFilter(row: AnnouncementMatrixRow): boolean {
  const name = row.routePolicyName.toLowerCase();
  if (name.includes("export")) return false;
  if (name.startsWith("c") && /\d/.test(name.slice(1, 4))) return false;
  if (name.includes("malha")) return false;
  return name.includes("origin") || name.includes("import");
}

export async function loadLatestMatrixSnapshot(deviceId: number): Promise<MatrixSnapshotView | null> {
  const [row] = await db
    .select()
    .from(bgpAnnouncementMatrixSnapshotsTable)
    .where(and(
      eq(bgpAnnouncementMatrixSnapshotsTable.deviceId, deviceId),
      eq(bgpAnnouncementMatrixSnapshotsTable.isLatest, true),
    ))
    .orderBy(desc(bgpAnnouncementMatrixSnapshotsTable.generatedAt))
    .limit(1);

  if (!row) return null;
  return toSnapshotView(row);
}

export async function loadAnnouncementMatrixSnapshotById(snapshotId: number): Promise<MatrixSnapshotView | null> {
  const [row] = await db
    .select()
    .from(bgpAnnouncementMatrixSnapshotsTable)
    .where(eq(bgpAnnouncementMatrixSnapshotsTable.id, snapshotId))
    .limit(1);
  return row ? toSnapshotView(row) : null;
}

export async function loadMatrixSnapshotSince(deviceId: number, since: Date): Promise<MatrixSnapshotView[]> {
  const rows = await db
    .select()
    .from(bgpAnnouncementMatrixSnapshotsTable)
    .where(and(
      eq(bgpAnnouncementMatrixSnapshotsTable.deviceId, deviceId),
      gte(bgpAnnouncementMatrixSnapshotsTable.generatedAt, since),
    ))
    .orderBy(desc(bgpAnnouncementMatrixSnapshotsTable.generatedAt))
    .limit(20);
  return rows.map((row) => toSnapshotView(row));
}

export function matrixRowsFromSnapshot(snapshot: MatrixSnapshotView | null): CompactMatrixRow[] {
  return snapshot?.rowsJson ?? [];
}

export async function latestAnnouncementMatrixDiff(deviceId: number, snapshotId: number): Promise<{
  added: unknown[];
  removed: unknown[];
  changed: unknown[];
  summary: AnnouncementMatrixDiffSummary | null;
} | null> {
  const [row] = await db
    .select()
    .from(bgpAnnouncementMatrixDiffsTable)
    .where(and(
      eq(bgpAnnouncementMatrixDiffsTable.deviceId, deviceId),
      eq(bgpAnnouncementMatrixDiffsTable.currentSnapshotId, snapshotId),
    ))
    .orderBy(desc(bgpAnnouncementMatrixDiffsTable.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    added: row.addedJson as unknown[],
    removed: row.removedJson as unknown[],
    changed: row.changedJson as unknown[],
    summary: row.summaryJson as AnnouncementMatrixDiffSummary | null,
  };
}

export async function getAnnouncementMatrixDiffDetail(previousSnapshotId: number, currentSnapshotId: number): Promise<AnnouncementMatrixDiffDetail | null> {
  const [row] = await db
    .select()
    .from(bgpAnnouncementMatrixDiffsTable)
    .where(and(
      eq(bgpAnnouncementMatrixDiffsTable.previousSnapshotId, previousSnapshotId),
      eq(bgpAnnouncementMatrixDiffsTable.currentSnapshotId, currentSnapshotId),
    ))
    .orderBy(desc(bgpAnnouncementMatrixDiffsTable.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    previousSnapshotId: row.previousSnapshotId,
    currentSnapshotId: row.currentSnapshotId,
    deviceId: row.deviceId,
    diffHash: row.diffHash,
    added: row.addedJson as unknown[],
    removed: row.removedJson as unknown[],
    changed: row.changedJson as unknown[],
    summary: row.summaryJson as AnnouncementMatrixDiffSummary | null,
  };
}

export async function listAnnouncementHistoryEvents(input: {
  deviceId?: number;
  targetPolicyName?: string | null;
  prefix?: string | null;
  upstreamCircuitId?: string | null;
  upstreamName?: string | null;
  family?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  eventType?: string | null;
  limit?: number;
}): Promise<AnnouncementHistoryEvent[]> {
  let query: any = db.select().from(bgpAnnouncementHistoryEventsTable);
  let whereClause: unknown = null;
  const append = (condition: unknown) => {
    whereClause = whereClause ? and(whereClause as any, condition as any) : condition;
  };
  if (typeof input.deviceId === "number") append(eq(bgpAnnouncementHistoryEventsTable.deviceId, input.deviceId));
  if (input.targetPolicyName) append(eq(bgpAnnouncementHistoryEventsTable.targetPolicyName, input.targetPolicyName));
  if (input.upstreamCircuitId) append(eq(bgpAnnouncementHistoryEventsTable.upstreamCircuitId, input.upstreamCircuitId));
  if (input.upstreamName) append(eq(bgpAnnouncementHistoryEventsTable.upstreamName, input.upstreamName));
  if (input.family) append(eq(bgpAnnouncementHistoryEventsTable.family, input.family));
  if (input.eventType) append(eq(bgpAnnouncementHistoryEventsTable.eventType, input.eventType));
  if (input.dateFrom) append(gte(bgpAnnouncementHistoryEventsTable.detectedAt, input.dateFrom));
  if (input.dateTo) append(lte(bgpAnnouncementHistoryEventsTable.detectedAt, input.dateTo));
  if (whereClause) {
    query = query.where(whereClause);
  }
  const rows = await query.orderBy(asc(bgpAnnouncementHistoryEventsTable.detectedAt)).limit(input.limit ?? 200);
  const prefixNeedle = input.prefix?.trim().toLowerCase() ?? "";
  return rows
    .filter((row: any) => !prefixNeedle || (row.prefix ?? "").toLowerCase().includes(prefixNeedle))
    .map((row: any) => ({
      id: row.id,
      deviceId: row.deviceId,
      targetPolicyName: row.targetPolicyName,
      family: row.family,
      prefix: row.prefix,
      upstreamCircuitId: row.upstreamCircuitId,
      upstreamName: row.upstreamName,
      eventType: row.eventType,
      oldState: row.oldState,
      newState: row.newState,
      oldCommunity: row.oldCommunity,
      newCommunity: row.newCommunity,
      snapshotId: row.snapshotId,
      detectedAt: row.detectedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));
}

export function buildAnnouncementTimelapse(events: AnnouncementHistoryEvent[]): AnnouncementHistoryEvent[] {
  return [...events].sort((left, right) => new Date(left.detectedAt).getTime() - new Date(right.detectedAt).getTime());
}

function toSnapshotView(row: BgpAnnouncementMatrixSnapshotRow): MatrixSnapshotView {
  return {
    id: row.id,
    deviceId: row.deviceId,
    tenantId: null,
    collectionId: row.collectionId,
    snapshotVersion: row.snapshotVersion,
    snapshotHash: row.snapshotHash,
    isLatest: row.isLatest,
    status: row.status,
    source: row.source as AnnouncementSnapshotSource,
    familyScope: row.familyScope as AnnouncementFamilyScope,
    totalTargets: row.totalTargets,
    totalUpstreams: row.totalUpstreams,
    totalCells: row.totalCells,
    totalFindings: row.totalFindings,
    totalCriticalFindings: row.totalCriticalFindings,
    matrixJson: row.matrixJson as AnnouncementMatrixPayload,
    summaryJson: row.summaryJson as AnnouncementMatrixSummaryPayload,
    filtersJson: row.filtersJson as Record<string, unknown>,
    generatedAt: row.generatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    rowsJson: compactRowsFromPayload(row.matrixJson as AnnouncementMatrixPayload),
  };
}

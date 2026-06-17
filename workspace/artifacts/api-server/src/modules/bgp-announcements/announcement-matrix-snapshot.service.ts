import { bgpAnnouncementMatrixSnapshotsTable, db, type BgpAnnouncementMatrixSnapshot } from "@workspace/db";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { MatrixResponse, MatrixRow, SnapshotSummary } from "./bgp-announcement.types.js";
import { snapshotSummaryFromMeta } from "./services/announcement-snapshot-refresh.service.js";

export interface CompactMatrixRow {
  key: string;
  routePolicyName: string;
  family: string;
  targetType: string;
  affectedPrefixes: string[];
  cells: Array<{ circuitId: string; state: string; upstreamName: string }>;
}

function isFullMatrixRow(row: unknown): row is MatrixRow {
  return typeof row === "object" && row !== null && "targetKey" in row && "cells" in row;
}

export function compactMatrixRows(rows: MatrixResponse["rows"]): CompactMatrixRow[] {
  return rows.map((row) => ({
    key: `${row.routePolicyName}|${row.family}|${row.affectedPrefixes.join(",")}`,
    routePolicyName: row.routePolicyName,
    family: row.family,
    targetType: row.targetType,
    affectedPrefixes: row.affectedPrefixes,
    cells: row.cells.map((cell) => ({
      circuitId: cell.circuitId,
      state: cell.state,
      upstreamName: cell.upstreamName,
    })),
  }));
}

export function matrixSnapshotRowToResponse(row: BgpAnnouncementMatrixSnapshot): MatrixResponse | null {
  const rawRows = Array.isArray(row.rowsJson) ? row.rowsJson : [];
  if (rawRows.length > 0 && !isFullMatrixRow(rawRows[0])) {
    return null;
  }

  const meta = (row.metaJson ?? {}) as MatrixResponse["meta"] & {
    findings?: MatrixResponse["findings"];
    generatedAt?: string;
  };

  return {
    deviceId: row.deviceId,
    upstreams: Array.isArray(row.upstreamsJson)
      ? row.upstreamsJson as MatrixResponse["upstreams"]
      : [],
    rows: rawRows as MatrixRow[],
    findings: Array.isArray(meta.findings) ? meta.findings : [],
    generatedAt: meta.generatedAt ?? row.createdAt.toISOString(),
    meta: {
      source: meta.source ?? "persisted_snapshot",
      dataSource: meta.dataSource,
      collectionAgeMinutes: meta.collectionAgeMinutes ?? null,
      lastCollectedAt: meta.lastCollectedAt ?? null,
      readOnly: true,
      refreshMode: meta.refreshMode ?? "database_only",
      snapshotId: row.id,
      snapshotCreatedAt: row.createdAt.toISOString(),
      counters: meta.counters,
      warnings: meta.warnings,
      status: meta.status,
    },
  };
}

export async function persistAnnouncementMatrixSnapshot(matrix: MatrixResponse): Promise<number | null> {
  const [row] = await db
    .insert(bgpAnnouncementMatrixSnapshotsTable)
    .values({
      deviceId: matrix.deviceId,
      rowsJson: matrix.rows,
      upstreamsJson: matrix.upstreams,
      metaJson: {
        ...(matrix.meta ?? {}),
        findings: matrix.findings,
        generatedAt: matrix.generatedAt,
      },
      rowCount: matrix.rows.length,
    })
    .returning({ id: bgpAnnouncementMatrixSnapshotsTable.id });

  return row?.id ?? null;
}

export async function loadMatrixSnapshotById(snapshotId: number) {
  const [row] = await db
    .select()
    .from(bgpAnnouncementMatrixSnapshotsTable)
    .where(eq(bgpAnnouncementMatrixSnapshotsTable.id, snapshotId))
    .limit(1);

  return row ?? null;
}

export async function loadMatrixSnapshotAt(deviceId: number, at: Date) {
  const [before] = await db
    .select()
    .from(bgpAnnouncementMatrixSnapshotsTable)
    .where(and(
      eq(bgpAnnouncementMatrixSnapshotsTable.deviceId, deviceId),
      lt(bgpAnnouncementMatrixSnapshotsTable.createdAt, at),
    ))
    .orderBy(desc(bgpAnnouncementMatrixSnapshotsTable.createdAt))
    .limit(1);

  return before ?? null;
}

export async function loadLatestMatrixSnapshot(deviceId: number) {
  const [latest] = await db
    .select()
    .from(bgpAnnouncementMatrixSnapshotsTable)
    .where(eq(bgpAnnouncementMatrixSnapshotsTable.deviceId, deviceId))
    .orderBy(desc(bgpAnnouncementMatrixSnapshotsTable.createdAt))
    .limit(1);

  return latest ?? null;
}

export async function listRecentMatrixSnapshots(deviceId: number, limit = 20): Promise<SnapshotSummary[]> {
  const rows = await db
    .select()
    .from(bgpAnnouncementMatrixSnapshotsTable)
    .where(eq(bgpAnnouncementMatrixSnapshotsTable.deviceId, deviceId))
    .orderBy(desc(bgpAnnouncementMatrixSnapshotsTable.createdAt))
    .limit(limit);

  return rows.map((row) => snapshotSummaryFromMeta(row));
}

export async function loadMatrixSnapshotSince(deviceId: number, since: Date) {
  return db
    .select()
    .from(bgpAnnouncementMatrixSnapshotsTable)
    .where(and(
      eq(bgpAnnouncementMatrixSnapshotsTable.deviceId, deviceId),
      gte(bgpAnnouncementMatrixSnapshotsTable.createdAt, since),
    ))
    .orderBy(desc(bgpAnnouncementMatrixSnapshotsTable.createdAt))
    .limit(20);
}

export function diffCompactMatrixRows(
  older: CompactMatrixRow[],
  newer: CompactMatrixRow[],
): {
  added: CompactMatrixRow[];
  removed: CompactMatrixRow[];
  changed: Array<{ key: string; routePolicyName: string; before: string; after: string }>;
} {
  const oldMap = new Map(older.map((row) => [row.key, row]));
  const newMap = new Map(newer.map((row) => [row.key, row]));

  const added = newer.filter((row) => !oldMap.has(row.key));
  const removed = older.filter((row) => !newMap.has(row.key));
  const changed: Array<{ key: string; routePolicyName: string; before: string; after: string }> = [];

  for (const [key, newRow] of newMap) {
    const oldRow = oldMap.get(key);
    if (!oldRow) continue;
    const oldCells = oldRow.cells.map((cell) => `${cell.circuitId}:${cell.state}`).join(",");
    const newCells = newRow.cells.map((cell) => `${cell.circuitId}:${cell.state}`).join(",");
    if (oldCells !== newCells) {
      changed.push({
        key,
        routePolicyName: newRow.routePolicyName,
        before: oldCells,
        after: newCells,
      });
    }
  }

  return { added, removed, changed };
}

import { createHash } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { bgpPeerDrilldownSnapshotsTable, db } from "@workspace/db";
import { env } from "../../lib/env.js";
import type { BgpPeerDrilldownResult } from "./bgp-peer-drilldown.types.js";

export type BgpPeerDrilldownHistoryFreshness = "fresh" | "stale" | "expired";

export interface BgpPeerDrilldownHistoryItem {
  id: number;
  deviceId: number;
  peer: string;
  source: string;
  configBuildSource: string;
  peerHash: string;
  collectedAt: string;
  expiresAt: string;
  warnings: string[];
  warningsCount: number;
  freshnessStatus: BgpPeerDrilldownHistoryFreshness;
  createdAt: string;
}

export interface BgpPeerDrilldownCachedRow {
  id: number;
  expiresAt: Date;
  snapshot: BgpPeerDrilldownResult;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (!val || typeof val !== "object" || Array.isArray(val)) return val;
    return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
  });
}

export function computeBgpPeerDrilldownHash(result: BgpPeerDrilldownResult): string {
  return createHash("sha256")
    .update(stableJson({
      deviceId: result.deviceId,
      peer: result.peer,
      source: result.source,
      configBuildSource: result.configBuildSource,
      collectedAt: result.collectedAt,
      root: result.root,
      families: result.families,
      effectivePolicies: result.effectivePolicies,
      policies: result.policies,
      dependencies: result.dependencies,
      warnings: result.warnings,
    }))
    .digest("hex");
}

export function buildBgpPeerDrilldownSnapshotInsert(
  result: BgpPeerDrilldownResult,
  ttlSeconds = env.bgpDrilldownCacheTtlSeconds,
  cacheSource = "snapshot",
) {
  const collectedAt = new Date(result.collectedAt);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + Math.max(1, ttlSeconds) * 1000);

  return {
    deviceId: result.deviceId,
    peer: result.peer,
    source: cacheSource,
    configBuildSource: result.configBuildSource,
    peerHash: computeBgpPeerDrilldownHash(result),
    collectedAt,
    expiresAt,
    snapshotJson: result,
    runtimeJson: result.runtime,
    warnings: result.warnings,
  };
}

export async function persistBgpPeerDrilldownSnapshot(result: BgpPeerDrilldownResult): Promise<void> {
  await db.insert(bgpPeerDrilldownSnapshotsTable).values(buildBgpPeerDrilldownSnapshotInsert(result));
}

export function computeHistoryFreshness(expiresAt: Date, now = new Date()): BgpPeerDrilldownHistoryFreshness {
  if (expiresAt.getTime() <= now.getTime()) return "expired";
  const remainingMs = expiresAt.getTime() - now.getTime();
  const ttlMs = env.bgpDrilldownCacheTtlSeconds * 1000;
  if (remainingMs <= ttlMs * 0.25) return "stale";
  return "fresh";
}

export async function getFreshBgpPeerDrilldownSnapshot(
  deviceId: number,
  peer: string,
): Promise<BgpPeerDrilldownCachedRow | null> {
  const [row] = await db
    .select({
      id: bgpPeerDrilldownSnapshotsTable.id,
      expiresAt: bgpPeerDrilldownSnapshotsTable.expiresAt,
      snapshotJson: bgpPeerDrilldownSnapshotsTable.snapshotJson,
    })
    .from(bgpPeerDrilldownSnapshotsTable)
    .where(and(
      eq(bgpPeerDrilldownSnapshotsTable.deviceId, deviceId),
      eq(bgpPeerDrilldownSnapshotsTable.peer, peer),
      eq(bgpPeerDrilldownSnapshotsTable.source, "snapshot"),
      gt(bgpPeerDrilldownSnapshotsTable.expiresAt, new Date()),
    ))
    .orderBy(desc(bgpPeerDrilldownSnapshotsTable.collectedAt))
    .limit(1);

  if (!row?.snapshotJson) return null;
  return {
    id: row.id,
    expiresAt: row.expiresAt,
    snapshot: row.snapshotJson as BgpPeerDrilldownResult,
  };
}

export async function hasExpiredBgpPeerDrilldownSnapshot(deviceId: number, peer: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bgpPeerDrilldownSnapshotsTable.id })
    .from(bgpPeerDrilldownSnapshotsTable)
    .where(and(
      eq(bgpPeerDrilldownSnapshotsTable.deviceId, deviceId),
      eq(bgpPeerDrilldownSnapshotsTable.peer, peer),
      eq(bgpPeerDrilldownSnapshotsTable.source, "snapshot"),
    ))
    .orderBy(desc(bgpPeerDrilldownSnapshotsTable.collectedAt))
    .limit(1);
  if (!row) return false;
  const [fresh] = await db
    .select({ id: bgpPeerDrilldownSnapshotsTable.id })
    .from(bgpPeerDrilldownSnapshotsTable)
    .where(and(
      eq(bgpPeerDrilldownSnapshotsTable.deviceId, deviceId),
      eq(bgpPeerDrilldownSnapshotsTable.peer, peer),
      eq(bgpPeerDrilldownSnapshotsTable.source, "snapshot"),
      gt(bgpPeerDrilldownSnapshotsTable.expiresAt, new Date()),
    ))
    .limit(1);
  return !fresh;
}

export async function getBgpPeerDrilldownSnapshotById(
  deviceId: number,
  peer: string,
  snapshotRowId: number,
): Promise<BgpPeerDrilldownResult | null> {
  const [row] = await db
    .select({ snapshotJson: bgpPeerDrilldownSnapshotsTable.snapshotJson })
    .from(bgpPeerDrilldownSnapshotsTable)
    .where(and(
      eq(bgpPeerDrilldownSnapshotsTable.id, snapshotRowId),
      eq(bgpPeerDrilldownSnapshotsTable.deviceId, deviceId),
      eq(bgpPeerDrilldownSnapshotsTable.peer, peer),
    ))
    .limit(1);
  return (row?.snapshotJson as BgpPeerDrilldownResult | undefined) ?? null;
}

export async function listBgpPeerDrilldownHistory(
  deviceId: number,
  peer: string,
  limit = 20,
): Promise<BgpPeerDrilldownHistoryItem[]> {
  const rows = await db
    .select({
      id: bgpPeerDrilldownSnapshotsTable.id,
      deviceId: bgpPeerDrilldownSnapshotsTable.deviceId,
      peer: bgpPeerDrilldownSnapshotsTable.peer,
      source: bgpPeerDrilldownSnapshotsTable.source,
      configBuildSource: bgpPeerDrilldownSnapshotsTable.configBuildSource,
      peerHash: bgpPeerDrilldownSnapshotsTable.peerHash,
      collectedAt: bgpPeerDrilldownSnapshotsTable.collectedAt,
      expiresAt: bgpPeerDrilldownSnapshotsTable.expiresAt,
      warnings: bgpPeerDrilldownSnapshotsTable.warnings,
      createdAt: bgpPeerDrilldownSnapshotsTable.createdAt,
    })
    .from(bgpPeerDrilldownSnapshotsTable)
    .where(and(
      eq(bgpPeerDrilldownSnapshotsTable.deviceId, deviceId),
      eq(bgpPeerDrilldownSnapshotsTable.peer, peer),
    ))
    .orderBy(desc(bgpPeerDrilldownSnapshotsTable.collectedAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  const now = new Date();
  return rows.map((row) => ({
    ...row,
    collectedAt: row.collectedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : [],
    warningsCount: Array.isArray(row.warnings) ? row.warnings.length : 0,
    freshnessStatus: computeHistoryFreshness(row.expiresAt, now),
    createdAt: row.createdAt.toISOString(),
  }));
}

import { and, desc, eq } from "drizzle-orm";
import {
  collectedConfigsTable,
  db,
  devicesTable,
  discoverySnapshotsTable,
} from "@workspace/db";
import type { DeviceDiscoverySnapshot } from "../netops/device-discovery/discovery.types.js";
import {
  getFreshBgpPeerDrilldownSnapshot,
  getBgpPeerDrilldownSnapshotById,
  hasExpiredBgpPeerDrilldownSnapshot,
  listBgpPeerDrilldownHistory,
  persistBgpPeerDrilldownSnapshot,
} from "./bgp-peer-drilldown-cache.js";
import { compareBgpPeerDrilldownSnapshots } from "./bgp-peer-drilldown-comparison.js";
import { buildBgpPeerDrilldownResult } from "./bgp-peer-drilldown.builder.js";
import type { BgpPeerDrilldownCacheMeta, BgpPeerDrilldownQuery, BgpPeerDrilldownResult } from "./bgp-peer-drilldown.types.js";

export { buildBgpPeerDrilldownResult, resolvePeerKey } from "./bgp-peer-drilldown.builder.js";
export { compareBgpPeerDrilldownSnapshots } from "./bgp-peer-drilldown-comparison.js";

function attachCacheMeta(result: BgpPeerDrilldownResult, cache: BgpPeerDrilldownCacheMeta): BgpPeerDrilldownResult {
  return { ...result, cache };
}

export async function getBgpPeerDrilldown(
  deviceId: number,
  peer: string,
  query: BgpPeerDrilldownQuery,
): Promise<BgpPeerDrilldownResult | "device_not_found" | "no_config"> {
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) return "device_not_found";

  const canUseCache = !query.snapshotId && !query.jobId && query.includePolicies !== false && query.includePolicyObjects !== false;

  if (canUseCache && !query.forceRecompute) {
    const cached = await getFreshBgpPeerDrilldownSnapshot(deviceId, peer);
    if (cached) {
      return attachCacheMeta(cached.snapshot, {
        status: "fresh",
        servedFromCache: true,
        rowId: cached.id,
        expiresAt: cached.expiresAt.toISOString(),
        configBuildSource: cached.snapshot.configBuildSource,
      });
    }
  }

  let snapshotRow;
  if (query.snapshotId) {
    [snapshotRow] = await db
      .select()
      .from(discoverySnapshotsTable)
      .where(and(eq(discoverySnapshotsTable.id, query.snapshotId), eq(discoverySnapshotsTable.deviceId, deviceId)))
      .limit(1);
  } else if (query.jobId) {
    [snapshotRow] = await db
      .select()
      .from(discoverySnapshotsTable)
      .where(and(eq(discoverySnapshotsTable.discoveryRunId, query.jobId), eq(discoverySnapshotsTable.deviceId, deviceId)))
      .orderBy(desc(discoverySnapshotsTable.createdAt))
      .limit(1);
  } else {
    [snapshotRow] = await db
      .select()
      .from(discoverySnapshotsTable)
      .where(eq(discoverySnapshotsTable.deviceId, deviceId))
      .orderBy(desc(discoverySnapshotsTable.createdAt))
      .limit(1);
  }

  const [collectedConfig] = await db
    .select()
    .from(collectedConfigsTable)
    .where(eq(collectedConfigsTable.deviceId, deviceId))
    .orderBy(desc(collectedConfigsTable.collectedAt))
    .limit(1);

  const snapshot = (snapshotRow?.snapshotJson ?? {
    deviceId,
    discoveryRunId: "none",
    status: "partial",
    contexts: [],
    startedAt: new Date(0).toISOString(),
    finishedAt: new Date(0).toISOString(),
    sourceStatus: {},
    sourcesUsed: ["local_db"],
    interfaces: [],
    bgpPeers: [],
    policies: [],
    communities: [],
    communityLists: [],
    prefixLists: [],
    ipv6PrefixLists: [],
    asPathFilters: [],
    extcommunityFilters: [],
    aclFilters: [],
    vrfs: [],
    l2vpn: { l2vcs: [], vsis: [], source: "local_db", confidence: "low" },
    warnings: [],
    audit: [],
  }) as DeviceDiscoverySnapshot;

  const rawConfig = collectedConfig?.rawConfig?.trim() ?? "";
  if (!rawConfig && !snapshotRow) return "no_config";

  const collectedAt = collectedConfig?.collectedAt ?? snapshotRow?.createdAt ?? new Date();

  const result = buildBgpPeerDrilldownResult({
    deviceId,
    peer,
    snapshot,
    rawConfig,
    collectedAt,
    snapshotId: snapshotRow?.id ?? null,
    query,
  });

  const hadExpiredCache = canUseCache && !query.forceRecompute
    ? await hasExpiredBgpPeerDrilldownSnapshot(deviceId, peer)
    : false;

  await persistBgpPeerDrilldownSnapshot(result);

  const cacheStatus = query.forceRecompute ? "recomputed" : hadExpiredCache ? "expired" : "miss";

  return attachCacheMeta(result, {
    status: cacheStatus,
    servedFromCache: false,
    rowId: null,
    expiresAt: null,
    configBuildSource: result.configBuildSource,
  });
}

export async function getBgpPeerDrilldownHistory(deviceId: number, peer: string, limit?: number) {
  const [device] = await db.select({ id: devicesTable.id }).from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) return "device_not_found" as const;
  return listBgpPeerDrilldownHistory(deviceId, peer, limit);
}

export async function compareBgpPeerDrilldownHistory(
  deviceId: number,
  peer: string,
  leftId: number,
  rightId: number,
) {
  const [device] = await db.select({ id: devicesTable.id }).from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) return "device_not_found" as const;
  if (leftId === rightId) return "same_snapshot" as const;

  const [left, right] = await Promise.all([
    getBgpPeerDrilldownSnapshotById(deviceId, peer, leftId),
    getBgpPeerDrilldownSnapshotById(deviceId, peer, rightId),
  ]);
  if (!left || !right) return "snapshot_not_found" as const;
  return compareBgpPeerDrilldownSnapshots(leftId, rightId, left, right);
}

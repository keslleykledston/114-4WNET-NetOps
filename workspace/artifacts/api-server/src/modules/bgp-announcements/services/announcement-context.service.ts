import { desc, eq } from "drizzle-orm";
import { collectedConfigsTable, db, discoverySnapshotsTable } from "@workspace/db";
import type { DeviceDiscoverySnapshot } from "../../netops/device-discovery/discovery.types.js";
import {
  buildPolicyDependencyConfigFromSnapshot,
  parseHuaweiPolicyDependencyPipeline,
  type ParsedPolicyDependencyConfig,
} from "../../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import { buildBgpPolicyGraph, type BgpPolicyGraph } from "../graph/bgp-policy-graph.builder.js";

export interface AnnouncementDeviceContext {
  deviceId: number;
  snapshot: DeviceDiscoverySnapshot | null;
  rawConfig: string;
  parsedConfig: ParsedPolicyDependencyConfig;
  graph: BgpPolicyGraph;
  collectionAgeMinutes: number | null;
  lastCollectedAt: string | null;
  source: "discovery_snapshot" | "collected_config" | "none";
}

export async function loadAnnouncementDeviceContext(deviceId: number): Promise<AnnouncementDeviceContext | "no_data"> {
  const [snapshotRow] = await db
    .select()
    .from(discoverySnapshotsTable)
    .where(eq(discoverySnapshotsTable.deviceId, deviceId))
    .orderBy(desc(discoverySnapshotsTable.createdAt))
    .limit(1);

  const [configRow] = await db
    .select({ rawConfig: collectedConfigsTable.rawConfig, collectedAt: collectedConfigsTable.collectedAt })
    .from(collectedConfigsTable)
    .where(eq(collectedConfigsTable.deviceId, deviceId))
    .orderBy(desc(collectedConfigsTable.collectedAt))
    .limit(1);

  const rawConfig = configRow?.rawConfig?.trim() ?? "";
  const snapshot = snapshotRow?.snapshotJson
    ? snapshotRow.snapshotJson as DeviceDiscoverySnapshot
    : null;

  if (!snapshot && !rawConfig) {
    return "no_data";
  }

  const lastCollectedAt = snapshotRow?.createdAt?.toISOString() ?? configRow?.collectedAt?.toISOString() ?? null;
  const collectionAgeMinutes = snapshotRow?.createdAt
    ? Math.round((Date.now() - snapshotRow.createdAt.getTime()) / 60000)
    : configRow?.collectedAt
      ? Math.round((Date.now() - configRow.collectedAt.getTime()) / 60000)
      : null;

  const parsedConfig = snapshot
    ? buildPolicyDependencyConfigFromSnapshot(snapshot, { rawConfig })
    : parseHuaweiPolicyDependencyPipeline(rawConfig, "ssh_running_config");

  const graph = buildBgpPolicyGraph(parsedConfig, rawConfig);

  return {
    deviceId,
    snapshot,
    rawConfig,
    parsedConfig,
    graph,
    collectionAgeMinutes,
    lastCollectedAt,
    source: snapshot ? "discovery_snapshot" : "collected_config",
  };
}

import { collectedConfigsTable, db } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { getLatestDiscoverySnapshot } from "../../netops/device-discovery/discovery.service.js";

export type AnnouncementDeviceContext =
  | "no_data"
  | {
      deviceId: number;
      source: "discovery_snapshot" | "raw_config" | "empty";
      lastCollectedAt: string | null;
      rawConfig: string;
      parsedConfig: {
        consumers: {
          route_policies: Record<string, { name: string; nodes: Array<{ sequence: number | null; action: string | null; matches: string[]; applies: string[] }> }>;
          bgp_peers: Record<string, { peerIp?: string | null; importPolicy?: string | null; exportPolicy?: string | null; name?: string | null }>;
        };
        catalogs: Record<string, { type?: string; entries?: Array<Record<string, unknown>> }>;
      };
    };

export async function loadAnnouncementDeviceContext(deviceId: number): Promise<AnnouncementDeviceContext> {
  const latestDiscovery = await getLatestDiscoverySnapshot(deviceId);
  if (!latestDiscovery && !(await hasRawConfig(deviceId))) return "no_data";

  const rawConfig = (await loadLatestRawConfig(deviceId)) ?? "";
  const routePolicies: Record<string, { name: string; nodes: Array<{ sequence: number | null; action: string | null; matches: string[]; applies: string[] }> }> = {};
  const bgpPeers: Record<string, { peerIp?: string | null; importPolicy?: string | null; exportPolicy?: string | null; name?: string | null }> = {};
  if (latestDiscovery) {
    for (const policy of latestDiscovery.policies ?? []) {
      routePolicies[policy.name.toLowerCase()] = {
        name: policy.name,
        nodes: policy.nodes.map((node) => ({
          sequence: node.sequence,
          action: node.action,
          matches: node.matches,
          applies: node.applies,
        })),
      };
    }
    for (const peer of latestDiscovery.bgpPeers ?? []) {
      const peerKey = (peer.peerIp ?? peer.name ?? "").toLowerCase();
      if (!peerKey) continue;
      bgpPeers[peerKey] = {
        peerIp: peer.peerIp,
        importPolicy: peer.importPolicy ?? null,
        exportPolicy: peer.exportPolicy ?? null,
        name: peer.name ?? null,
      };
    }
  }

  return {
    deviceId,
    source: latestDiscovery ? "discovery_snapshot" : "raw_config",
    lastCollectedAt: latestDiscovery?.finishedAt ?? null,
    rawConfig,
    parsedConfig: {
      consumers: {
        route_policies: routePolicies,
        bgp_peers: bgpPeers,
      },
      catalogs: {},
    },
  };
}

async function hasRawConfig(deviceId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: collectedConfigsTable.id })
    .from(collectedConfigsTable)
    .where(eq(collectedConfigsTable.deviceId, deviceId))
    .limit(1);
  return Boolean(row);
}

async function loadLatestRawConfig(deviceId: number): Promise<string | null> {
  const [row] = await db
    .select({ rawConfig: collectedConfigsTable.rawConfig, collectedAt: collectedConfigsTable.collectedAt })
    .from(collectedConfigsTable)
    .where(eq(collectedConfigsTable.deviceId, deviceId))
    .orderBy(desc(collectedConfigsTable.collectedAt))
    .limit(1);
  return row?.rawConfig ?? null;
}

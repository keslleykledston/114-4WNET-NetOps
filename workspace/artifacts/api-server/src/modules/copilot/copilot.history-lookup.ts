import { bgpPeerCollectionHistoryTable, bgpRouteHistoryTable, db, devicesTable } from "@workspace/db";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { CopilotHistoryEvent } from "./copilot.types.js";

type PeerJson = {
  peerIp?: string;
  remoteAs?: number | null;
  state?: string;
  vrf?: string | null;
};

function peerList(value: unknown): PeerJson[] {
  return Array.isArray(value) ? value as PeerJson[] : [];
}

export async function lookupOperationalHistory(input: {
  deviceIds: number[];
  peerIp?: string | null;
  prefix?: string | null;
  sinceHours?: number;
}): Promise<CopilotHistoryEvent[]> {
  if (input.deviceIds.length === 0) return [];

  const since = new Date(Date.now() - (input.sinceHours ?? 48) * 3_600_000);
  const devices = await db
    .select({ id: devicesTable.id, hostname: devicesTable.hostname })
    .from(devicesTable)
    .where(inArray(devicesTable.id, input.deviceIds));
  const hostnameById = new Map(devices.map((device) => [device.id, device.hostname]));

  const events: CopilotHistoryEvent[] = [];

  const peerHistory = await db
    .select()
    .from(bgpPeerCollectionHistoryTable)
    .where(and(
      inArray(bgpPeerCollectionHistoryTable.deviceId, input.deviceIds),
      gte(bgpPeerCollectionHistoryTable.createdAt, since),
    ))
    .orderBy(desc(bgpPeerCollectionHistoryTable.createdAt))
    .limit(30);

  for (const row of peerHistory) {
    const removed = peerList(row.removedPeersJson);
    const filtered = input.peerIp
      ? removed.filter((peer) => peer.peerIp === input.peerIp)
      : removed;

    if (filtered.length === 0 && row.removedCount === 0) continue;

    events.push({
      kind: "peer_collection_diff",
      deviceId: row.deviceId,
      deviceHostname: hostnameById.get(row.deviceId) ?? `device-${row.deviceId}`,
      collectedAt: row.createdAt.toISOString(),
      summary: filtered.length > 0
        ? `${filtered.length} peer(s) removido(s) no snapshot SNMP`
        : `${row.removedCount} remocao(oes) registrada(s)`,
      details: filtered.map((peer) => `${peer.peerIp ?? "?"} AS${peer.remoteAs ?? "?"}`),
    });
  }

  if (input.prefix) {
    const routeRows = await db
      .select()
      .from(bgpRouteHistoryTable)
      .where(and(
        inArray(bgpRouteHistoryTable.deviceId, input.deviceIds),
        gte(bgpRouteHistoryTable.createdAt, since),
        eq(bgpRouteHistoryTable.status, "ok"),
      ))
      .orderBy(desc(bgpRouteHistoryTable.createdAt))
      .limit(40);

    for (const row of routeRows) {
      const routes = Array.isArray(row.routesJson) ? row.routesJson as Array<{ prefix?: string }> : [];
      const hit = routes.some((route) => route.prefix?.includes(input.prefix!.split("/")[0] ?? input.prefix!));
      if (!hit) continue;
      events.push({
        kind: "route_query",
        deviceId: row.deviceId,
        deviceHostname: hostnameById.get(row.deviceId) ?? `device-${row.deviceId}`,
        collectedAt: row.createdAt.toISOString(),
        summary: `Prefixo visto em consulta BGP ${row.direction} (peer ${row.peerIp})`,
        details: [`total=${row.totalRoutes}`, `returned=${row.routesReturned}`],
      });
    }
  }

  return events
    .sort((left, right) => right.collectedAt.localeCompare(left.collectedAt))
    .slice(0, 20);
}

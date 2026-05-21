import type { DeviceDiscoveryRequest, DeviceDiscoverySnapshot, DiscoveryStatus, DiscoveryWarning } from "./discovery.types.js";
import { collectionOrchestrator } from "./discovery.orchestrator.js";
import { rawEvidenceStore } from "./evidence/evidence-store.js";
import { bgpPeerRoleOverridesTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { normalizeDiscoveryBgpPeers, primaryDirectionForRole } from "./normalizers/bgp.normalizer.js";

const DEFAULT_CONTEXTS = ["interfaces", "bgp", "l2vpn", "policies", "vrfs"] as const;

async function applyRoleOverrides(deviceId: number, peers: ReturnType<typeof normalizeDiscoveryBgpPeers>) {
  const overrides = await db
    .select()
    .from(bgpPeerRoleOverridesTable)
    .where(eq(bgpPeerRoleOverridesTable.deviceId, deviceId));
  const byPeer = new Map(overrides.map((override) => [`${override.peerIp}|${override.addressFamily}`, override]));

  return peers.map((peer) => {
    const override = byPeer.get(`${peer.peerIp}|${peer.addressFamily}`);
    if (!override) return peer;
    return {
      ...peer,
      role: override.role as typeof peer.role,
      category: override.role as typeof peer.category,
      primaryDirection: primaryDirectionForRole(override.role as typeof peer.role),
      roleSource: "manual_override" as const,
      remoteAs: override.remoteAs ?? peer.remoteAs,
      name: override.label ?? peer.name,
    };
  });
}

export function normalizeDiscoveryRequest(body: unknown): DeviceDiscoveryRequest {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const contexts = Array.isArray(input.contexts)
    ? input.contexts.filter((item): item is DeviceDiscoveryRequest["contexts"][number] =>
        item === "interfaces" || item === "bgp" || item === "l2vpn" || item === "policies" || item === "vrfs")
    : [...DEFAULT_CONTEXTS];

  return {
    contexts: contexts.length ? contexts : [...DEFAULT_CONTEXTS],
    preferLiveSsh: input.preferLiveSsh !== false,
    allowSnmpFallback: input.allowSnmpFallback !== false,
    useCachedConfig: input.useCachedConfig !== false,
  };
}

export async function runDeviceDiscovery(deviceId: number, request: DeviceDiscoveryRequest) {
  return collectionOrchestrator.run(deviceId, request);
}

export async function getLatestDiscoverySnapshot(deviceId: number) {
  const memorySnapshot = rawEvidenceStore.getLatestSnapshot(deviceId);
  if (memorySnapshot) return memorySnapshot;

  const persisted = await rawEvidenceStore.getLatestPersistentSnapshot(deviceId);
  if (!persisted) return null;

  const snapshot = persisted.snapshotJson as DeviceDiscoverySnapshot;
  const status: DiscoveryStatus = snapshot.status === "failed" ? "failed" : "cached";
  const recoveredWarning: DiscoveryWarning = {
    level: "info",
    source: "system",
    message: "Snapshot persistido recuperado do banco local.",
  };
  return {
    ...snapshot,
    status,
    persistedSnapshotId: persisted.id,
    cachedFromPersistedSnapshot: true,
    bgpPeers: await applyRoleOverrides(deviceId, snapshot.bgpPeers),
    warnings: [
      ...snapshot.warnings,
      recoveredWarning,
    ],
  };
}

export async function listDiscoveryBgpPeers(deviceId: number, category?: string) {
  const snapshot = await getLatestDiscoverySnapshot(deviceId);
  if (!snapshot) return null;
  return snapshot.bgpPeers.filter((peer) => !category || peer.category === category);
}

export async function getDiscoveryBgpPeerDetails(deviceId: number, peerIp: string) {
  const snapshot = await getLatestDiscoverySnapshot(deviceId);
  if (!snapshot) return null;
  return collectionOrchestrator.buildPeerDetails(snapshot, peerIp);
}

export async function queryDiscoveryRoutes(deviceId: number, peerIp: string, body: unknown) {
  const { db } = await import("@workspace/db");
  const { queryBgpRoutes } = await import("./services/bgp-routes.service.js");

  const device = await db.query.devicesTable.findFirst({
    where: (devices, { eq }) => eq(devices.id, deviceId),
  });

  if (!device) return null;

  const details = await getDiscoveryBgpPeerDetails(deviceId, peerIp);
  if (!details) return null;

  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const direction = input.direction === "advertised" ? "advertised" : "received";

  return await queryBgpRoutes(
    device,
    peerIp,
    (details.peer.name || details.peer.description) || undefined,
    direction,
    details.peer.vrf || null,
    details.routeCounters,
    {
      direction,
      limit: input.limit as number | undefined,
      page: input.page as number | undefined,
      offset: input.offset as number | undefined,
      filter: input.filter as string | undefined,
    }
  );
}

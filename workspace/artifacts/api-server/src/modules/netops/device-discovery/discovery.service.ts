import type { DeviceDiscoveryRequest, DeviceDiscoverySnapshot, DiscoveryStatus, DiscoveryWarning } from "./discovery.types.js";
import { collectionOrchestrator } from "./discovery.orchestrator.js";
import { rawEvidenceStore } from "./evidence/evidence-store.js";
import { bgpPeerRoleOverridesTable, db, devicesTable, snmpSnapshotsTable } from "@workspace/db";
import { desc, eq as ormEq } from "drizzle-orm";
import { logAuditEvent } from "../../../lib/audit.js";
import { normalizeDiscoveryBgpPeers, primaryDirectionForRole } from "./normalizers/bgp.normalizer.js";
import { snapshotToNetopsData } from "../adapters/snapshot-adapter.js";

const DEFAULT_CONTEXTS = ["interfaces", "bgp", "l2vpn", "policies", "vrfs"] as const;

async function applyRoleOverrides(deviceId: number, peers: ReturnType<typeof normalizeDiscoveryBgpPeers>) {
  const overrides = await db
    .select()
    .from(bgpPeerRoleOverridesTable)
    .where(ormEq(bgpPeerRoleOverridesTable.deviceId, deviceId));
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

export async function assertDeviceExists(deviceId: number) {
  const [device] = await db.select({ id: devicesTable.id }).from(devicesTable).where(ormEq(devicesTable.id, deviceId)).limit(1);
  return device ?? null;
}

export async function runDeviceDiscovery(deviceId: number, request: DeviceDiscoveryRequest) {
  return collectionOrchestrator.run(deviceId, request);
}

export async function getDiscoveryRunStatus(deviceId: number) {
  const run = await rawEvidenceStore.getLatestPersistentRun(deviceId);
  if (!run) {
    return { deviceId, status: "idle" as const, runId: null, finishedAt: null, summary: null };
  }
  return {
    deviceId,
    status: run.status as "running" | "full" | "partial" | "fallback" | "cached" | "failed" | "idle",
    runId: run.id,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    summary: run.summaryJson as Record<string, unknown> | null,
    sshStatus: run.sshStatus,
    snmpStatus: run.snmpStatus,
  };
}

export function enqueueDeviceDiscovery(
  deviceId: number,
  request: DeviceDiscoveryRequest,
  audit?: { sourceIp?: string | null },
): void {
  setImmediate(() => {
    void (async () => {
      try {
        const snapshot = await runDeviceDiscovery(deviceId, request);
        if (!snapshot) return;
        await logAuditEvent({
          action: "discover",
          objectType: "device",
          objectId: String(deviceId),
          metadata: {
            contexts: snapshot.contexts,
            status: snapshot.status,
            sourcesUsed: snapshot.sourcesUsed,
            warnings: snapshot.warnings.length,
            async: true,
          },
          sourceIp: audit?.sourceIp ?? undefined,
        });
      } catch (error) {
        const run = await rawEvidenceStore.getLatestPersistentRun(deviceId);
        if (run?.status === "running") {
          const { discoveryRunsTable, db } = await import("@workspace/db");
          const { eq } = await import("drizzle-orm");
          await db.update(discoveryRunsTable).set({
            status: "failed",
            finishedAt: new Date(),
            sshMessage: error instanceof Error ? error.message : String(error),
          }).where(eq(discoveryRunsTable.id, run.id));
        }
      }
    })();
  });
}

async function getLatestSnmpBgpPeers(deviceId: number) {
  const [snapshot] = await db
    .select()
    .from(snmpSnapshotsTable)
    .where(ormEq(snmpSnapshotsTable.deviceId, deviceId))
    .orderBy(desc(snmpSnapshotsTable.collectedAt))
    .limit(1);

  if (!snapshot) return null;

  const data = snapshotToNetopsData(snapshot);
  return normalizeDiscoveryBgpPeers([], data.bgpPeers, [], []);
}

async function applyRoleOverridesToPeers(deviceId: number, peers: ReturnType<typeof normalizeDiscoveryBgpPeers>) {
  const overrides = await db
    .select()
    .from(bgpPeerRoleOverridesTable)
    .where(ormEq(bgpPeerRoleOverridesTable.deviceId, deviceId));
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

export async function getLatestDiscoverySnapshot(deviceId: number) {
  const memorySnapshot = rawEvidenceStore.getLatestSnapshot(deviceId);
  if (memorySnapshot) {
    return {
      ...memorySnapshot,
      bgpPeers: await applyRoleOverridesToPeers(deviceId, memorySnapshot.bgpPeers),
    };
  }

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
  const device = await db.query.devicesTable.findFirst({
    where: (devices, { eq }) => eq(devices.id, deviceId),
  });
  if (!device) return null;

  const snapshot = await getLatestDiscoverySnapshot(deviceId);
  const peers = snapshot?.bgpPeers
    ?? await applyRoleOverridesToPeers(deviceId, await getLatestSnmpBgpPeers(deviceId) ?? [])
    ?? [];
  return peers.filter((peer) => !category || peer.category === category);
}

export async function getDiscoveryBgpPeerDetails(deviceId: number, peerIp: string) {
  const snapshot = await getLatestDiscoverySnapshot(deviceId);
  if (snapshot) {
    return collectionOrchestrator.buildPeerDetails(snapshot, peerIp);
  }

  const peers = await getLatestSnmpBgpPeers(deviceId);
  if (!peers) return null;
  const peer = (await applyRoleOverridesToPeers(deviceId, peers)).find((item) => item.peerIp === peerIp);
  if (!peer) return null;

  return collectionOrchestrator.buildPeerDetails({
    deviceId,
    discoveryRunId: `snmp-fallback-${deviceId}`,
    status: "cached",
    contexts: ["bgp"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    sourceStatus: {
      ssh: "skipped",
      snmp: "success",
      cachedConfig: "skipped",
    },
    sourcesUsed: ["snmp_snapshot"],
    interfaces: [],
    bgpPeers: peers,
    policies: [],
    communities: [],
    communityLists: [],
    prefixLists: [],
    ipv6PrefixLists: [],
    vrfs: [],
    l2vpn: {
      source: "snmp_snapshot",
      confidence: "low",
      l2vcs: [],
      vsis: [],
    },
    warnings: [],
    audit: [],
  }, peerIp);
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

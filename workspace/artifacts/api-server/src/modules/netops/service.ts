import { bgpPeerCollectionHistoryTable, bgpPeerRoleOverridesTable, db, devicesTable, snmpSnapshotsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { decrypt } from "../../lib/crypto.js";
import { collectDiscoverySsh } from "./device-discovery/collectors/ssh.collector.js";
import { getLatestDiscoverySnapshot } from "./device-discovery/discovery.service.js";
import { snapshotToNetopsData } from "./adapters/snapshot-adapter.js";
import { discoverySnapshotToNetopsData } from "./adapters/discovery-netops.adapter.js";
import { deriveDeviceKind } from "./device-profile/device-profile-resolver.js";
import { snmpReadonlyAdapter } from "./adapters/snmp-readonly-adapter.js";
import { getLatestSnmpCollectorSnapshot } from "./snmp/snapshot-queries.js";
import { dedupeBgpPeersForDisplay } from "./bgp/bgp-peer-display-normalizer.js";
import type {
  NetopsAddressFamilyFilter,
  NetopsBgpPeer,
  NetopsBgpCommunities,
  NetopsBgpDiagnostics,
  NetopsBgpPolicies,
  NetopsBgpPrefixEntry,
  NetopsBgpPeerRoleOverride,
  NetopsBgpPeerRoleOverrideInput,
  NetopsBgpPeerRoleOverrideResult,
  NetopsBgpRoleFilter,
  NetopsBgpStateFilter,
  NetopsCommunity,
  NetopsCollectionStatus,
  NetopsDeviceSummary,
  NetopsFilter,
  NetopsInterface,
  NetopsLatestSnmpSnapshot,
  NetopsLogEntry,
  NetopsReadonlyCollectionResult,
} from "./types.js";
import { toSafeDevice } from "./types.js";

export async function getDeviceOrNull(deviceId: number) {
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  return device ?? null;
}

async function getLatestSnapshot(deviceId: number) {
  return getLatestSnmpCollectorSnapshot(deviceId);
}

export async function getNetopsSummary(deviceId: number): Promise<NetopsDeviceSummary | null> {
  const device = await getDeviceOrNull(deviceId);
  if (!device) return null;

  const snmpSnapshot = await getLatestSnapshot(deviceId);
  const discoverySnapshot = await getLatestDiscoverySnapshot(deviceId);
  const data = buildReadonlySnapshotData(snmpSnapshot, discoverySnapshot);
  if (!data) return null;
  const bgpEstablished = data.bgpPeers.filter((peer) => peer.state === "Established").length;

  return {
    device: toSafeDevice(device),
    counters: {
      interfaces: data.interfaces.length,
      bgpPeers: data.bgpPeers.length,
      bgpEstablished,
      bgpDown: data.bgpPeers.length - bgpEstablished,
      filters: data.filters.length,
      communities: data.communities.length,
    },
    lastSnapshotAt: data.snapshot?.collectedAt.toISOString() ?? null,
    deviceKind: deriveDeviceKind(device),
  };
}

export async function listNetopsInterfaces(deviceId: number): Promise<NetopsInterface[] | null> {
  const data = await getSnapshotDataOrNull(deviceId);
  if (!data) return null;
  return data.interfaces;
}

function filterBgpPeers(
  peers: NetopsBgpPeer[],
  filters: { role?: NetopsBgpRoleFilter; af?: NetopsAddressFamilyFilter; state?: NetopsBgpStateFilter },
): NetopsBgpPeer[] {
  return peers.filter((peer) => {
    if (filters.role && peer.role !== filters.role) return false;
    if (filters.af && peer.addressFamily !== filters.af) return false;
    if (filters.state === "Established" && peer.state !== "Established") return false;
    if (filters.state === "Down" && peer.state === "Established") return false;
    if (
      filters.state &&
      filters.state !== "Established" &&
      filters.state !== "Down" &&
      peer.state !== filters.state
    ) return false;
    return true;
  });
}

function toRoleOverride(row: typeof bgpPeerRoleOverridesTable.$inferSelect): NetopsBgpPeerRoleOverride {
  return {
    id: row.id,
    deviceId: row.deviceId,
    peerIp: row.peerIp,
    remoteAs: row.remoteAs,
    addressFamily: row.addressFamily as NetopsBgpPeerRoleOverride["addressFamily"],
    role: row.role as NetopsBgpPeerRoleOverride["role"],
    label: row.label,
    notes: row.notes,
    source: "manual_override",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

async function getRoleOverrides(deviceId: number): Promise<NetopsBgpPeerRoleOverride[]> {
  const rows = await db
    .select()
    .from(bgpPeerRoleOverridesTable)
    .where(eq(bgpPeerRoleOverridesTable.deviceId, deviceId));

  return rows.map(toRoleOverride);
}

function roleOverrideKey(peerIp: string, addressFamily: string): string {
  return `${peerIp}|${addressFamily}`;
}

function applyRoleOverrides(peers: NetopsBgpPeer[], overrides: NetopsBgpPeerRoleOverride[]): NetopsBgpPeer[] {
  const byPeer = new Map(overrides.map((override) => [
    roleOverrideKey(override.peerIp, override.addressFamily),
    override,
  ]));

  return peers.map((peer) => {
    const override = byPeer.get(roleOverrideKey(peer.peerIp, peer.addressFamily));
    if (!override) return peer;
    return {
      ...peer,
      role: override.role,
      roleSource: "manual_override",
      name: override.label ?? peer.name,
      remoteAs: override.remoteAs ?? peer.remoteAs,
    };
  });
}

function bgpPeerSnapshotKey(peer: Pick<NetopsBgpPeer, "peerIp" | "addressFamily" | "vrf">): string {
  return `${peer.peerIp.trim().toUpperCase()}|${peer.addressFamily}|${(peer.vrf ?? "").trim().toUpperCase()}`;
}

function diffBgpPeers(previousPeers: NetopsBgpPeer[], currentPeers: NetopsBgpPeer[]): NetopsBgpPeer[] {
  const currentKeys = new Set(currentPeers.map((peer) => bgpPeerSnapshotKey(peer)));
  return previousPeers.filter((peer) => !currentKeys.has(bgpPeerSnapshotKey(peer)));
}

function toRemovedPeerHistoryEntry(peer: NetopsBgpPeer, removedAt: string) {
  return {
    ...peer,
    collectionState: "removed",
    removedAt,
    removedReason: "missing_in_latest_snmp_collection",
  };
}

function readonlyBgpPeerKey(peer: Pick<NetopsBgpPeer, "peerIp" | "addressFamily" | "vrf">): string {
  return `${peer.peerIp.trim().toUpperCase()}|${peer.addressFamily}|${(peer.vrf ?? "").trim().toUpperCase()}`;
}

/** SNMP is authoritative for peer list; SSH/discovery only enriches matching peers (no union). */
export function mergeReadonlyBgpPeers(basePeers: NetopsBgpPeer[], detailPeers: NetopsBgpPeer[]): NetopsBgpPeer[] {
  const detailsByKey = new Map(detailPeers.map((peer) => [readonlyBgpPeerKey(peer), peer] as const));
  return basePeers.map((peer) => {
    const detail = detailsByKey.get(readonlyBgpPeerKey(peer));
    if (!detail) return { ...peer };

    return {
      ...peer,
      description: peer.description ?? detail.description,
      name: peer.name ?? detail.name,
      state: peer.state !== "Unknown" ? peer.state : detail.state,
      remoteAs: peer.remoteAs ?? detail.remoteAs,
      vrf: peer.vrf ?? detail.vrf,
      importPolicy: peer.importPolicy ?? detail.importPolicy,
      exportPolicy: peer.exportPolicy ?? detail.exportPolicy,
      receivedPrefixes: peer.receivedPrefixes ?? detail.receivedPrefixes,
      advertisedPrefixes: peer.advertisedPrefixes ?? detail.advertisedPrefixes,
      activePrefixes: peer.activePrefixes ?? detail.activePrefixes,
      // Uptime is SNMP-only here; Huawei SSH compact output can emit broken values like "****h36m".
      uptime: peer.uptime ?? null,
      source: peer.source,
    };
  }).sort((left, right) => left.peerIp.localeCompare(right.peerIp));
}

export async function recordBgpPeerRemovalHistory(input: {
  deviceId: number;
  collector: string;
  previousSnapshotId: number | null;
  currentSnapshotId: number | null;
  previousPeers: NetopsBgpPeer[];
  currentPeers: NetopsBgpPeer[];
}): Promise<number> {
  const removedAt = new Date().toISOString();
  const removedBgpPeers = diffBgpPeers(input.previousPeers, input.currentPeers);
  if (removedBgpPeers.length === 0) return 0;

  const removedHistoryPeers = removedBgpPeers.map((peer) => toRemovedPeerHistoryEntry(peer, removedAt));
  await db.insert(bgpPeerCollectionHistoryTable).values({
    deviceId: input.deviceId,
    collector: input.collector,
    previousSnapshotId: input.previousSnapshotId,
    currentSnapshotId: input.currentSnapshotId,
    previousPeersJson: JSON.stringify(input.previousPeers),
    currentPeersJson: JSON.stringify(input.currentPeers),
    removedPeersJson: JSON.stringify(removedHistoryPeers),
    removedCount: removedBgpPeers.length,
  });
  return removedBgpPeers.length;
}

function buildReadonlySnapshotData(snmpSnapshot: Awaited<ReturnType<typeof getLatestSnapshot>>, discoverySnapshot: Awaited<ReturnType<typeof getLatestDiscoverySnapshot>>) {
  const snmpData = snapshotToNetopsData(snmpSnapshot);
  const discoveryData = discoverySnapshot ? discoverySnapshotToNetopsData(discoverySnapshot) : null;

  if (!snmpSnapshot) {
    return discoverySnapshot
      ? {
          snapshot: null,
          ...discoveryData!,
        }
      : null;
  }

  return {
    snapshot: snmpSnapshot,
    interfaces: snmpData.interfaces.length > 0 ? snmpData.interfaces : discoveryData?.interfaces ?? [],
    bgpPeers: discoveryData ? mergeReadonlyBgpPeers(snmpData.bgpPeers, discoveryData.bgpPeers) : snmpData.bgpPeers,
    filters: discoveryData?.filters.length ? discoveryData.filters : snmpData.filters,
    communities: discoveryData?.communities.length ? discoveryData.communities : snmpData.communities,
  };
}

async function getSnapshotDataOrNull(deviceId: number) {
  if (!(await getDeviceOrNull(deviceId))) return null;
  const snmpSnapshot = await getLatestSnapshot(deviceId);
  const discoverySnapshot = await getLatestDiscoverySnapshot(deviceId);
  const data = buildReadonlySnapshotData(snmpSnapshot, discoverySnapshot);
  if (!data) return null;
  return {
    ...data,
    bgpPeers: applyRoleOverrides(data.bgpPeers, await getRoleOverrides(deviceId)),
  };
}

export async function listNetopsBgpPeers(
  deviceId: number,
  filters: { role?: NetopsBgpRoleFilter; af?: NetopsAddressFamilyFilter; state?: NetopsBgpStateFilter } = {},
): Promise<NetopsBgpPeer[] | null> {
  const data = await getSnapshotDataOrNull(deviceId);
  if (!data) return null;
  return dedupeBgpPeersForDisplay(filterBgpPeers(data.bgpPeers, filters));
}

export async function listNetopsFilters(deviceId: number): Promise<NetopsFilter[] | null> {
  if (!(await getDeviceOrNull(deviceId))) return null;
  return snapshotToNetopsData(await getLatestSnapshot(deviceId)).filters;
}

export async function listNetopsCommunities(deviceId: number): Promise<NetopsCommunity[] | null> {
  if (!(await getDeviceOrNull(deviceId))) return null;
  return snapshotToNetopsData(await getLatestSnapshot(deviceId)).communities;
}

export async function listNetopsLogs(deviceId: number): Promise<NetopsLogEntry[] | null> {
  const device = await getDeviceOrNull(deviceId);
  if (!device) return null;

  const snapshot = await getLatestSnapshot(deviceId);
  const overrides = await getRoleOverrides(deviceId);
  const roleLogs: NetopsLogEntry[] = overrides
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10)
    .map((override) => ({
      timestamp: override.updatedAt,
      level: "SUCCESS",
      scope: "BGP",
      message: `Papel do peer ${override.peerIp} atualizado para ${override.role}.`,
      source: "local",
    }));

  if (!snapshot) {
    return [...roleLogs, {
      timestamp: new Date().toISOString(),
      level: "INFO",
      scope: "SYSTEM",
      message: `No SNMP snapshot found for ${device.hostname}.`,
      source: "system",
    }];
  }

  return [...roleLogs, {
    timestamp: snapshot.collectedAt.toISOString(),
    level: snapshot.success ? "SUCCESS" : "ERROR",
    scope: "SNMP",
    message: snapshot.success
      ? `Latest SNMP snapshot loaded for ${device.hostname}.`
      : snapshot.errorMessage ?? `Latest SNMP snapshot failed for ${device.hostname}.`,
    source: "system",
  }];
}

export async function getLatestNetopsSnmpSnapshot(deviceId: number): Promise<NetopsLatestSnmpSnapshot | null> {
  if (!(await getDeviceOrNull(deviceId))) return null;
  const snapshot = await getLatestSnapshot(deviceId);

  if (!snapshot) {
    return {
      deviceId,
      snapshot: null,
      message: "Nenhum snapshot SNMP encontrado para este dispositivo.",
    };
  }

  return {
    deviceId,
    snapshot: {
      id: snapshot.id,
      deviceId: snapshot.deviceId,
      success: snapshot.success,
      errorMessage: snapshot.errorMessage,
      interfacesJson: snapshot.interfacesJson,
      bgpPeersJson: snapshot.bgpPeersJson,
      vrfsJson: snapshot.vrfsJson,
      collectedAt: snapshot.collectedAt.toISOString(),
    },
    message: "Snapshot SNMP encontrado.",
  };
}

export async function collectNetopsReadOnly(deviceId: number): Promise<NetopsReadonlyCollectionResult | null> {
  const device = await getDeviceOrNull(deviceId);
  if (!device) return null;

  const previousSnapshot = await getLatestSnapshot(deviceId);
  const previousBgpPeers = previousSnapshot ? snapshotToNetopsData(previousSnapshot).bgpPeers : [];

  const result = await snmpReadonlyAdapter.collect({ device });
  const payload = "payload" in result ? result.payload : undefined;
  const snmpBgpPeers = result.data.bgpPeers;
  let mergedBgpPeers = snmpBgpPeers;
  const removedAt = new Date().toISOString();

  if (payload && device.passwordEncrypted) {
    try {
      const password = decrypt(device.passwordEncrypted);
      const ssh = await collectDiscoverySsh(device, password, ["bgp", "policies"]);
      if (ssh.success) {
        mergedBgpPeers = mergeReadonlyBgpPeers(snmpBgpPeers, ssh.bgpPeers);
      } else {
        const discovery = await getLatestDiscoverySnapshot(deviceId);
        if (discovery) {
          mergedBgpPeers = mergeReadonlyBgpPeers(snmpBgpPeers, discovery.bgpPeers as unknown as NetopsBgpPeer[]);
        }
      }
    } catch {
      const discovery = await getLatestDiscoverySnapshot(deviceId);
      if (discovery) {
        mergedBgpPeers = mergeReadonlyBgpPeers(snmpBgpPeers, discovery.bgpPeers as unknown as NetopsBgpPeer[]);
      }
    }
  }

  const removedBgpPeers = diffBgpPeers(previousBgpPeers, snmpBgpPeers);

  if (result.executed && payload) {
    const now = new Date();
    await db.transaction(async (tx) => {
      const [snapshotRow] = await tx.insert(snmpSnapshotsTable).values({
        deviceId,
        collector: "snmp",
        collectorVersion: "phase5",
        success: payload.success,
        errorMessage: payload.errorMessage,
        errorsJson: payload.errors.length > 0 ? JSON.stringify(payload.errors) : null,
        interfacesJson: payload.interfaces.length > 0 ? JSON.stringify(payload.interfaces) : null,
        bgpPeersJson: snmpBgpPeers.length > 0 ? JSON.stringify(snmpBgpPeers) : null,
        vrfsJson: null,
        collectedAt: now,
      }).returning({ id: snmpSnapshotsTable.id });

      if (removedBgpPeers.length > 0) {
        const removedHistoryPeers = removedBgpPeers.map((peer) => toRemovedPeerHistoryEntry(peer, removedAt));
        await tx.insert(bgpPeerCollectionHistoryTable).values({
          deviceId,
          collector: "snmp",
          previousSnapshotId: previousSnapshot?.id ?? null,
          currentSnapshotId: snapshotRow?.id ?? null,
          previousPeersJson: JSON.stringify(previousBgpPeers),
          currentPeersJson: JSON.stringify(snmpBgpPeers),
          removedPeersJson: JSON.stringify(removedHistoryPeers),
          removedCount: removedBgpPeers.length,
        });
      }
    });

    if (payload.success) {
      await db.update(devicesTable)
        .set({ lastSeen: new Date(), updatedAt: new Date() })
        .where(eq(devicesTable.id, deviceId));
    }
  }

  const bgpEstablished = snmpBgpPeers.filter((p) => p.state === "Established").length;
  const bgpDown = snmpBgpPeers.length - bgpEstablished;

  return {
    deviceId: result.deviceId,
    status: result.executed ? "completed" : (result.status === "ready" || result.status === "blocked" ? "disabled" : result.status),
    executed: result.executed,
    collector: "snmp",
    message: result.executed && removedBgpPeers.length > 0
      ? `${result.message} ${removedBgpPeers.length} peer(s) ausente(s) foram registrados como removidos no histórico.`
      : result.message,
    commandChecks: result.commandChecks,
    collectedAt: result.executed ? new Date().toISOString() : undefined,
    summary: {
      interfaces: payload?.interfaces.length ?? 0,
      bgpPeers: snmpBgpPeers.length,
      bgpEstablished,
      bgpDown,
    },
    errors: payload?.errors ?? [],
  };
}

export async function getNetopsCollectionStatus(deviceId: number): Promise<NetopsCollectionStatus | null> {
  if (!(await getDeviceOrNull(deviceId))) return null;
  const snapshot = await getLatestSnapshot(deviceId);

  return {
    deviceId,
    status: "idle",
    active: false,
    lastSnapshotAt: snapshot?.collectedAt.toISOString() ?? null,
    message: snapshot
      ? "Ultima coleta SNMP disponivel no snapshot."
      : "Nenhuma coleta SNMP persistida. Use POST collect/read-only com NETOPS_SNMP_REAL_ENABLED=true.",
  };
}

export async function getNetopsBgpPeer(deviceId: number, peerIp: string): Promise<NetopsBgpPeer | null | undefined> {
  const peers = await listNetopsBgpPeers(deviceId);
  if (!peers) return null;
  return peers.find((peer) => peer.peerIp === peerIp);
}

export async function listNetopsBgpReceivedPrefixes(deviceId: number, peerIp: string): Promise<NetopsBgpPrefixEntry[] | null> {
  const peer = await getNetopsBgpPeer(deviceId, peerIp);
  if (peer === null) return null;
  return [];
}

export async function listNetopsBgpAdvertisedPrefixes(deviceId: number, peerIp: string): Promise<NetopsBgpPrefixEntry[] | null> {
  const peer = await getNetopsBgpPeer(deviceId, peerIp);
  if (peer === null) return null;
  return [];
}

export async function getNetopsBgpPolicies(deviceId: number, peerIp: string): Promise<NetopsBgpPolicies | null> {
  const peer = await getNetopsBgpPeer(deviceId, peerIp);
  if (peer === null) return null;

  return {
    peerIp,
    importPolicy: peer?.importPolicy ?? null,
    exportPolicy: peer?.exportPolicy ?? null,
    filters: [],
    source: peer?.source ?? "snapshot",
    message: peer ? "Policies normalizadas a partir do snapshot disponivel." : "Peer nao encontrado no snapshot atual.",
  };
}

export async function getNetopsBgpCommunities(deviceId: number, peerIp: string): Promise<NetopsBgpCommunities | null> {
  const peer = await getNetopsBgpPeer(deviceId, peerIp);
  if (peer === null) return null;

  return {
    peerIp,
    communities: [],
    source: peer?.source ?? "snapshot",
    message: peer ? "Communities ainda nao descobertas para este peer." : "Peer nao encontrado no snapshot atual.",
  };
}

export async function getNetopsBgpDiagnostics(deviceId: number, peerIp: string): Promise<NetopsBgpDiagnostics | null> {
  const peer = await getNetopsBgpPeer(deviceId, peerIp);
  if (peer === null) return null;

  return {
    peerIp,
    source: peer?.source ?? "snapshot",
    checks: peer
      ? [
          {
            name: "session-state",
            level: peer.state === "Established" ? "SUCCESS" : "WARN",
            message: `BGP session state: ${peer.state}.`,
          },
          {
            name: "read-only-guard",
            level: "SUCCESS",
            message: "Diagnostics read-only from SNMP snapshot. No router command executed.",
          },
        ]
      : [{
          name: "snapshot-peer",
          level: "WARN",
          message: "Peer nao encontrado no snapshot atual.",
        }],
  };
}

export async function listNetopsBgpPeerRoleOverrides(deviceId: number): Promise<NetopsBgpPeerRoleOverride[] | null> {
  if (!(await getDeviceOrNull(deviceId))) return null;
  return getRoleOverrides(deviceId);
}

export async function upsertNetopsBgpPeerRoleOverride(
  deviceId: number,
  peerIp: string,
  input: NetopsBgpPeerRoleOverrideInput,
): Promise<NetopsBgpPeerRoleOverrideResult | null> {
  if (!(await getDeviceOrNull(deviceId))) return null;

  await db
    .insert(bgpPeerRoleOverridesTable)
    .values({
      deviceId,
      peerIp,
      remoteAs: input.remoteAs,
      addressFamily: input.addressFamily,
      role: input.role,
      label: input.label ?? null,
      notes: input.notes ?? null,
      source: "manual_override",
      createdBy: "local",
      updatedBy: "local",
    })
    .onConflictDoUpdate({
      target: [
        bgpPeerRoleOverridesTable.deviceId,
        bgpPeerRoleOverridesTable.peerIp,
        bgpPeerRoleOverridesTable.addressFamily,
      ],
      set: {
        remoteAs: input.remoteAs,
        role: input.role,
        label: input.label ?? null,
        notes: input.notes ?? null,
        source: "manual_override",
        updatedBy: "local",
        updatedAt: sql`now()`,
      },
    });

  return {
    ok: true,
    peerIp,
    role: input.role,
    source: "manual_override",
  };
}

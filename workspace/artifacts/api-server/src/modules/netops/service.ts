import { bgpPeerRoleOverridesTable, db, devicesTable, snmpSnapshotsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { snapshotToNetopsData } from "./adapters/snapshot-adapter.js";
import { snmpReadonlyAdapter } from "./adapters/snmp-readonly-adapter.js";
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
  const [snapshot] = await db
    .select()
    .from(snmpSnapshotsTable)
    .where(eq(snmpSnapshotsTable.deviceId, deviceId))
    .orderBy(desc(snmpSnapshotsTable.collectedAt))
    .limit(1);

  return snapshot ?? null;
}

export async function getNetopsSummary(deviceId: number): Promise<NetopsDeviceSummary | null> {
  const device = await getDeviceOrNull(deviceId);
  if (!device) return null;

  const data = snapshotToNetopsData(await getLatestSnapshot(deviceId));
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
  };
}

export async function listNetopsInterfaces(deviceId: number): Promise<NetopsInterface[] | null> {
  if (!(await getDeviceOrNull(deviceId))) return null;
  return snapshotToNetopsData(await getLatestSnapshot(deviceId)).interfaces;
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

async function getSnapshotDataOrNull(deviceId: number) {
  if (!(await getDeviceOrNull(deviceId))) return null;
  const data = snapshotToNetopsData(await getLatestSnapshot(deviceId));
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
  return filterBgpPeers(data.bgpPeers, filters);
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

  const result = await snmpReadonlyAdapter.collect({ device });
  const payload = "payload" in result ? result.payload : undefined;

  if (result.executed && payload) {
    await db.insert(snmpSnapshotsTable).values({
      deviceId,
      collector: "snmp",
      collectorVersion: "phase5",
      success: payload.success,
      errorMessage: payload.errorMessage,
      errorsJson: payload.errors.length > 0 ? JSON.stringify(payload.errors) : null,
      interfacesJson: payload.interfaces.length > 0 ? JSON.stringify(payload.interfaces) : null,
      bgpPeersJson: payload.bgpPeers.length > 0 ? JSON.stringify(payload.bgpPeers) : null,
      vrfsJson: null,
    });

    if (payload.success) {
      await db.update(devicesTable)
        .set({ lastSeen: new Date(), updatedAt: new Date() })
        .where(eq(devicesTable.id, deviceId));
    }
  }

  const bgpEstablished = payload?.bgpPeers.filter((p) => p.state === "Established").length ?? 0;
  const bgpDown = (payload?.bgpPeers.length ?? 0) - bgpEstablished;

  return {
    deviceId: result.deviceId,
    status: result.executed ? "completed" : (result.status === "ready" || result.status === "blocked" ? "disabled" : result.status),
    executed: result.executed,
    collector: "snmp",
    message: result.message,
    commandChecks: result.commandChecks,
    collectedAt: result.executed ? new Date().toISOString() : undefined,
    summary: {
      interfaces: payload?.interfaces.length ?? 0,
      bgpPeers: payload?.bgpPeers.length ?? 0,
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

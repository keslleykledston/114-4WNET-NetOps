import { collectedConfigsTable, db, devicesTable, snmpSnapshotsTable } from "@workspace/db";
import type { SnmpSnapshot } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { DeviceDiscoverySnapshot } from "../device-discovery/discovery.types.js";
import type { NetopsBgpPeer, NetopsCommunity, NetopsFilter, NetopsInterface, NetopsSnapshotData, NetopsSource } from "../types.js";
import { snapshotToNetopsData } from "./snapshot-adapter.js";

function mapSource(source: string | undefined): NetopsSource {
  if (source === "snmp_snapshot") return "snmp";
  if (source === "ssh_live" || source === "ssh_running_config") return "ssh";
  if (source === "local_db") return "db";
  return "snapshot";
}

function discoveryInterfaces(snapshot: DeviceDiscoverySnapshot): NetopsInterface[] {
  return snapshot.interfaces.map((item) => ({
    name: item.name,
    description: item.description,
    alias: item.alias,
    rawDescr: item.rawDescr,
    adminStatus: item.adminStatus,
    operStatus: item.operStatus,
    ipv4: item.ipv4,
    ipv6: item.ipv6,
    vlan: item.vlan,
    vrf: item.vrf,
    source: mapSource(item.source),
    ifIndex: item.ifIndex,
    kind: item.kind,
    parentInterface: item.parentInterface,
    vlanId: item.vlanId,
    encapsulation: item.encapsulation,
  }));
}

function discoveryBgpPeers(snapshot: DeviceDiscoverySnapshot): NetopsBgpPeer[] {
  return snapshot.bgpPeers.map((peer) => ({
    peerIp: peer.peerIp,
    remoteAs: peer.remoteAs,
    description: peer.description,
    name: peer.name,
    state: peer.state,
    role: peer.category ?? peer.role,
    roleSource: peer.roleSource,
    addressFamily: peer.addressFamily,
    sessionType: peer.sessionType,
    vrf: peer.vrf,
    importPolicy: peer.importPolicy,
    exportPolicy: peer.exportPolicy,
    receivedPrefixes: peer.receivedPrefixes,
    advertisedPrefixes: peer.advertisedPrefixes,
    activePrefixes: peer.activePrefixes,
    uptime: peer.uptime,
    source: mapSource(peer.source),
  }));
}

function discoveryFilters(snapshot: DeviceDiscoverySnapshot): NetopsFilter[] {
  const filters: NetopsFilter[] = [];

  for (const policy of snapshot.policies) {
    filters.push({
      name: policy.name,
      type: "route-policy",
      entries: policy.nodes,
      source: mapSource(policy.source),
    });
  }
  for (const prefix of snapshot.prefixLists ?? []) {
    filters.push({
      name: prefix.name,
      type: "prefix-list",
      entries: prefix.entries,
      source: mapSource(prefix.source),
    });
  }
  for (const prefix of snapshot.ipv6PrefixLists ?? []) {
    filters.push({
      name: prefix.name,
      type: "ipv6-prefix",
      entries: prefix.entries,
      source: mapSource(prefix.source),
    });
  }
  for (const item of snapshot.asPathFilters ?? []) {
    filters.push({
      name: item.name,
      type: "as-path-filter",
      entries: item.entries,
      source: mapSource(item.source),
    });
  }
  for (const item of snapshot.extcommunityFilters ?? []) {
    filters.push({
      name: item.name,
      type: "extcommunity-filter",
      entries: item.entries,
      source: mapSource(item.source),
    });
  }
  for (const item of snapshot.aclFilters ?? []) {
    filters.push({
      name: item.name,
      type: "acl",
      entries: item.entries,
      source: mapSource(item.source),
    });
  }

  return filters.sort((left, right) => left.name.localeCompare(right.name));
}

function discoveryCommunities(snapshot: DeviceDiscoverySnapshot): NetopsCommunity[] {
  const communities: NetopsCommunity[] = [];

  for (const item of snapshot.communities) {
    communities.push({
      name: item.name,
      type: "community-filter",
      entries: item.entries,
      source: mapSource(item.source),
    });
  }
  for (const item of snapshot.communityLists) {
    communities.push({
      name: item.name,
      type: "community-list",
      entries: item.entries,
      source: mapSource(item.source),
    });
  }

  return communities.sort((left, right) => left.name.localeCompare(right.name));
}

export function discoverySnapshotToNetopsData(snapshot: DeviceDiscoverySnapshot): Omit<NetopsSnapshotData, "snapshot"> {
  return {
    interfaces: discoveryInterfaces(snapshot),
    bgpPeers: discoveryBgpPeers(snapshot),
    filters: discoveryFilters(snapshot),
    communities: discoveryCommunities(snapshot),
  };
}

export function shouldPreferDiscoverySnapshot(
  discovery: DeviceDiscoverySnapshot | null,
  snmpSnapshot: SnmpSnapshot | null,
): discovery is DeviceDiscoverySnapshot {
  if (!discovery) return false;
  if (discovery.sourceStatus.ssh !== "success") return false;
  if (!snmpSnapshot) return true;
  return new Date(discovery.finishedAt).getTime() >= snmpSnapshot.collectedAt.getTime();
}

export function mergeNetopsInventory(
  snmpSnapshot: SnmpSnapshot | null,
  discovery: DeviceDiscoverySnapshot | null,
): NetopsSnapshotData {
  if (shouldPreferDiscoverySnapshot(discovery, snmpSnapshot)) {
    return {
      snapshot: snmpSnapshot,
      ...discoverySnapshotToNetopsData(discovery),
    };
  }
  return snapshotToNetopsData(snmpSnapshot);
}

function extractRunningConfig(rawOutputs: Array<{ command?: string; output: string }>): string {
  const match = rawOutputs.find((item) => item.command?.trim().replace(/\s+/g, " ") === "display current-configuration");
  return match?.output?.trim() ?? "";
}

export async function persistSshDiscoveryToNetopsStores(
  deviceId: number,
  snapshot: DeviceDiscoverySnapshot,
  rawOutputs: Array<{ command?: string; output: string }>,
): Promise<void> {
  if (snapshot.sourceStatus.ssh !== "success") return;

  const inventory = discoverySnapshotToNetopsData(snapshot);
  const rawConfig = extractRunningConfig(rawOutputs);
  const sshSuccess = snapshot.status !== "failed";

  await db.insert(snmpSnapshotsTable).values({
    deviceId,
    collector: "ssh",
    collectorVersion: "discovery-v1",
    success: sshSuccess,
    errorMessage: sshSuccess ? null : snapshot.warnings.find((item) => item.level === "error")?.message ?? "SSH discovery failed",
    errorsJson: snapshot.warnings.length > 0 ? JSON.stringify(snapshot.warnings) : null,
    interfacesJson: inventory.interfaces.length > 0 ? JSON.stringify(inventory.interfaces) : null,
    bgpPeersJson: inventory.bgpPeers.length > 0 ? JSON.stringify(inventory.bgpPeers) : null,
    vrfsJson: JSON.stringify({
      vrfs: snapshot.vrfs,
      l2vpn: snapshot.l2vpn,
      filters: inventory.filters,
      communities: inventory.communities,
      discoveryRunId: snapshot.discoveryRunId,
    }),
  });

  if (rawConfig) {
    await db.insert(collectedConfigsTable).values({
      deviceId,
      rawConfig,
      parsedInterfaces: inventory.interfaces.length > 0 ? JSON.stringify(inventory.interfaces) : null,
      parsedBgp: inventory.bgpPeers.length > 0 ? JSON.stringify(inventory.bgpPeers) : null,
      parsedL2vpn: snapshot.l2vpn ? JSON.stringify(snapshot.l2vpn) : null,
      parsedL3vpn: snapshot.vrfs.length > 0 ? JSON.stringify(snapshot.vrfs) : null,
    });
  }

  await db.update(devicesTable)
    .set({ lastSeen: new Date(), updatedAt: new Date() })
    .where(eq(devicesTable.id, deviceId));
}

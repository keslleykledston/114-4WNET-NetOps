import type { Device, SnmpSnapshot } from "@workspace/db";

export type NetopsSource = "snmp" | "ssh" | "snapshot" | "mock" | "db";
export type NetopsBgpRole = "provider" | "customer" | "cdn" | "ix" | "cdn_ix" | "ibgp" | "unknown";
export type NetopsBgpRoleFilter = NetopsBgpRole;
export type NetopsBgpRoleSource = "manual_override" | "classifier" | "snapshot" | "unknown";
export type NetopsAddressFamily = "ipv4" | "ipv6" | "unknown";
export type NetopsAddressFamilyFilter = Extract<NetopsAddressFamily, "ipv4" | "ipv6">;
export type NetopsBgpStateFilter = NetopsBgpPeer["state"] | "Down";

export interface NetopsSafeDevice {
  id: number;
  hostname: string;
  ipAddress: string;
  vendor: string;
  platform: string;
  site: string;
  role: string | null;
  status: string;
  lastSeen: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NetopsCounters {
  interfaces: number;
  bgpPeers: number;
  bgpEstablished: number;
  bgpDown: number;
  filters: number;
  communities: number;
}

export interface NetopsDeviceSummary {
  device: NetopsSafeDevice;
  counters: NetopsCounters;
  lastSnapshotAt: string | null;
  deviceKind: "router" | "switch" | "unknown";
}

export interface NetopsInterface {
  name: string;
  description: string | null;
  alias?: string | null;
  rawDescr?: string | null;
  adminStatus: "up" | "down" | "unknown";
  operStatus: "up" | "down" | "unknown";
  ipv4: string[];
  ipv6: string[];
  vlan: number | null;
  vrf: string | null;
  source: NetopsSource;
  ifIndex?: number;
  kind?: "physical" | "aggregate" | "subinterface" | "vlanif" | "loopback" | "tunnel" | "virtual_template" | "null" | "other";
  parentInterface?: string;
  vlanId?: number;
  encapsulation?: string;
}

export interface NetopsBgpPeer {
  peerIp: string;
  remoteAs: number | null;
  description: string | null;
  name: string | null;
  state: "Established" | "Idle" | "Active" | "Connect" | "Unknown";
  role: NetopsBgpRole;
  roleSource: NetopsBgpRoleSource;
  addressFamily: NetopsAddressFamily;
  sessionType: "iBGP" | "eBGP" | "unknown";
  vrf: string | null;
  importPolicy: string | null;
  exportPolicy: string | null;
  receivedPrefixes: number | null;
  advertisedPrefixes: number | null;
  activePrefixes: number | null;
  uptime: string | null;
  source: NetopsSource;
}

export interface NetopsFilter {
  name: string;
  type: "ip-prefix" | "prefix-list" | "route-policy" | "acl" | "unknown";
  entries: unknown[];
  source: NetopsSource;
}

export interface NetopsCommunity {
  name: string;
  type: "community-filter" | "community-list" | "set" | "unknown";
  entries: unknown[];
  source: NetopsSource;
}

export interface NetopsLogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "SUCCESS";
  scope: "SNMP" | "SSH" | "BGP" | "INTERFACE" | "SYSTEM";
  message: string;
  source: "system" | "local";
}

export interface NetopsLatestSnmpSnapshot {
  deviceId: number;
  snapshot: {
    id: number;
    deviceId: number;
    success: boolean;
    errorMessage: string | null;
    interfacesJson: string | null;
    bgpPeersJson: string | null;
    vrfsJson: string | null;
    collectedAt: string;
  } | null;
  message: string;
}

export interface NetopsSnapshotData {
  snapshot: SnmpSnapshot | null;
  interfaces: NetopsInterface[];
  bgpPeers: NetopsBgpPeer[];
  filters: NetopsFilter[];
  communities: NetopsCommunity[];
}

export interface NetopsCollectionStatus {
  deviceId: number;
  status: "idle" | "ready" | "blocked" | "error";
  active: boolean;
  lastSnapshotAt: string | null;
  message: string;
}

export interface NetopsReadonlyCollectionResult {
  deviceId: number;
  status: "idle" | "ready" | "blocked" | "error" | "disabled" | "completed";
  executed: boolean;
  collector: string;
  message: string;
  commandChecks: Array<{ command: string; allowed: boolean; reason: string | null }>;
  summary?: {
    interfaces: number;
    bgpPeers: number;
    bgpEstablished: number;
    bgpDown: number;
  };
  collectedAt?: string;
  errors?: string[];
}

export interface NetopsBgpPrefixEntry {
  prefix: string;
  nextHop: string | null;
  asPath: string | null;
  localPreference: number | null;
  med: number | null;
  source: NetopsSource;
}

export interface NetopsBgpPolicies {
  peerIp: string;
  importPolicy: string | null;
  exportPolicy: string | null;
  filters: NetopsFilter[];
  source: NetopsSource;
  message: string;
}

export interface NetopsBgpCommunities {
  peerIp: string;
  communities: NetopsCommunity[];
  source: NetopsSource;
  message: string;
}

export interface NetopsBgpDiagnostics {
  peerIp: string;
  checks: Array<{ name: string; level: NetopsLogEntry["level"]; message: string }>;
  source: NetopsSource;
}

export interface NetopsBgpPeerRoleOverride {
  id: number;
  deviceId: number;
  peerIp: string;
  remoteAs: number | null;
  addressFamily: NetopsAddressFamily;
  role: NetopsBgpRole;
  label: string | null;
  notes: string | null;
  source: "manual_override";
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface NetopsBgpPeerRoleOverrideInput {
  addressFamily: NetopsAddressFamily;
  remoteAs: number | null;
  role: NetopsBgpRole;
  label?: string | null;
  notes?: string | null;
}

export interface NetopsBgpPeerRoleOverrideResult {
  ok: true;
  peerIp: string;
  role: NetopsBgpRole;
  source: "manual_override";
}

export function toSafeDevice(device: Device): NetopsSafeDevice {
  return {
    id: device.id,
    hostname: device.hostname,
    ipAddress: device.ipAddress,
    vendor: device.vendor,
    platform: device.platform,
    site: device.site,
    role: device.role,
    status: device.status,
    lastSeen: device.lastSeen?.toISOString() ?? null,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
  };
}

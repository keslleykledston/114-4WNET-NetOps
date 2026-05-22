import type { Device } from "@workspace/db";
import type { NetopsBgpPeer, NetopsCommunity, NetopsFilter, NetopsInterface, NetopsSource } from "../types.js";

export type DiscoveryContext = "interfaces" | "bgp" | "l2vpn" | "policies" | "vrfs";
export type DiscoveryStatus = "full" | "partial" | "fallback" | "cached" | "failed";
export type DiscoverySource =
  | "ssh_live"
  | "ssh_running_config"
  | "manual_upload"
  | "snmp_snapshot"
  | "local_db"
  | "netbox";
export type DiscoveryConfidence = "high" | "medium" | "low";
export type EvidenceSource = "ssh" | "snmp" | "cached_config" | "uploaded_config" | "local_db";

export interface DeviceDiscoveryRequest {
  contexts: DiscoveryContext[];
  preferLiveSsh: boolean;
  allowSnmpFallback: boolean;
  useCachedConfig: boolean;
}

export interface DiscoveryEvidence {
  source: DiscoverySource;
  confidence: DiscoveryConfidence;
  evidence?: string;
}

export type Sourced<T> = Omit<T, "source"> & DiscoveryEvidence;

export interface InterfaceSummary extends Sourced<NetopsInterface> {
  exists: boolean;
}

export interface SubinterfaceSummary extends Omit<InterfaceSummary, "parentInterface"> {
  parentInterface: string | null;
}

export interface VlanSummary extends DiscoveryEvidence {
  id: number;
  name: string | null;
  exists: boolean;
}

export interface VrfSummary extends DiscoveryEvidence {
  name: string;
  rd: string | null;
  exists: boolean;
}

export interface BgpPeerSummary extends Sourced<NetopsBgpPeer> {
  category: NetopsBgpPeer["role"];
  primaryDirection: "import" | "export" | "internal";
  largeReceivedRoutes: boolean;
  largeAdvertisedRoutes: boolean;
  autoLoadRoutes: false;
  requiresExplicitRouteSearch: boolean;
}

export interface RoutePolicyNode {
  sequence: number | null;
  action: string | null;
  matches: string[];
  matchDetails?: Array<{
    type: "community-filter" | "community-list" | "ip-prefix" | "as-path-filter" | "extcommunity-filter" | "unknown";
    name: string;
    raw: string;
    qualifier?: "basic" | "advanced" | "whole-match" | null;
  }>;
  applies: string[];
  evidence: DiscoveryEvidence;
}

export interface RoutePolicySummary extends DiscoveryEvidence {
  name: string;
  nodes: RoutePolicyNode[];
}

export interface CommunityFilter extends DiscoveryEvidence {
  name: string;
  entries: unknown[];
}

export interface CommunityList extends DiscoveryEvidence {
  name: string;
  entries: unknown[];
}

export interface PrefixList extends DiscoveryEvidence {
  name: string;
  entries: unknown[];
}

export interface L2vcSummary extends DiscoveryEvidence {
  name: string;
  vcId: string | null;
  state: string | null;
}

export interface VsiSummary extends DiscoveryEvidence {
  name: string;
  state: string | null;
}

export interface L2vpnSummary extends DiscoveryEvidence {
  l2vcs: L2vcSummary[];
  vsis: VsiSummary[];
}

export interface DiscoveryWarning {
  level: "info" | "warning" | "error";
  message: string;
  source: EvidenceSource | "system";
}

export interface BgpPeerDetails {
  peer: BgpPeerSummary;
  category: NetopsBgpPeer["role"];
  primaryDirection: BgpPeerSummary["primaryDirection"];
  importPolicy: string | null;
  exportPolicy: string | null;
  primaryPolicy: string | null;
  secondaryPolicy: string | null;
  routePolicyNodes: RoutePolicyNode[];
  referencedIpPrefixes: PrefixList[];
  referencedCommunityFilters: CommunityFilter[];
  referencedCommunityLists: CommunityList[];
  routeCounters: {
    receivedRoutes: number | null;
    advertisedRoutes: number | null;
    largeReceivedRoutes: boolean;
    largeAdvertisedRoutes: boolean;
    autoLoadRoutes: false;
    requiresExplicitRouteSearch: boolean;
  };
  operationalState: NetopsBgpPeer["state"];
  protections: {
    noFullDumpAutomatic: true;
    sampleLimit: 50;
    maxAutoRoutes: 5000;
  };
  evidence: DiscoveryEvidence[];
}

export interface DeviceDiscoverySnapshot {
  deviceId: number;
  discoveryRunId: string;
  status: DiscoveryStatus;
  contexts: DiscoveryContext[];
  startedAt: string;
  finishedAt: string;
  sourceStatus: {
    ssh: "success" | "failed" | "skipped";
    snmp: "success" | "failed" | "skipped";
    cachedConfig: "used" | "available" | "missing" | "skipped";
  };
  persistedRunId?: number;
  persistedSnapshotId?: number | null;
  cachedFromPersistedSnapshot?: boolean;
  parserVersion?: string;
  parserVersions?: {
    interface?: string;
  };
  sourcesUsed: DiscoverySource[];
  interfaces: InterfaceSummary[];
  bgpPeers: BgpPeerSummary[];
  policies: RoutePolicySummary[];
  communities: CommunityFilter[];
  communityLists: CommunityList[];
  prefixLists: PrefixList[];
  vrfs: VrfSummary[];
  l2vpn: L2vpnSummary;
  warnings: DiscoveryWarning[];
  audit: DiscoveryWarning[];
}

export interface RawEvidenceRecord {
  deviceId: number;
  discoveryRunId: string;
  context: DiscoveryContext | "system";
  source: EvidenceSource;
  command?: string;
  oidGroup?: string;
  sanitizedOutput: string;
  status: "success" | "failed" | "skipped";
  startedAt: string;
  finishedAt: string;
  errorMessage?: string;
}

export interface DeviceResolverResult {
  device: Device;
}

export interface CredentialResolverResult {
  ssh: { username: string; password: string } | null;
  snmp: { available: boolean };
}

export interface CollectorOutput {
  source: NetopsSource;
  evidenceSource: EvidenceSource;
  success: boolean;
  rawOutputs: Array<{ command?: string; oidGroup?: string; output: string; error?: string }>;
  interfaces: NetopsInterface[];
  bgpPeers: NetopsBgpPeer[];
  filters: NetopsFilter[];
  communities: NetopsCommunity[];
  vrfs: VrfSummary[];
  l2vpn: L2vpnSummary;
  warnings: DiscoveryWarning[];
}

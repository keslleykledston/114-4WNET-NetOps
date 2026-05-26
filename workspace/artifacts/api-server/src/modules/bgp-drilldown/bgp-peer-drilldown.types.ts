import type { BgpAfiSafi } from "../netops/huawei-vrp/parsers/bgp-peer-dependency-parser.js";
import type { DependencyStatus, PolicyDependencyType } from "../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";

export type ConfigBuildSource = "raw_config" | "parsed_config_cache" | "snapshot_aggregate" | "unknown";
import type { DiscoverySource } from "../netops/device-discovery/discovery.types.js";

export type DrilldownSource = "local_db" | "ssh_full_config" | "snmp" | "ssh_detail" | "mixed";

export type BgpPeerRootStatus = "FOUND" | "MISSING";

export interface BgpPeerDrilldownQuery {
  source?: "snapshot";
  includePolicies?: boolean;
  includePolicyObjects?: boolean;
  snapshotId?: number;
  jobId?: number;
}

export interface BgpPeerRootConfig {
  peer: string;
  asNumber: number | null;
  description: string | null;
  group: string | null;
  connectInterface: string | null;
  timers: null;
  passwordPresent: boolean;
  source: DrilldownSource;
  status: BgpPeerRootStatus;
}

export interface BgpPeerFamilyConfig {
  afiSafi: BgpAfiSafi;
  vrf: string | null;
  enabled: boolean;
  importPolicy: string | null;
  exportPolicy: string | null;
  defaultRouteAdvertise: boolean;
  nextHopLocal: boolean;
  advertiseCommunity: boolean;
  advertiseExtCommunity: boolean;
  reflectClient: boolean;
  keepAllRoutes: null;
  filterPolicy: null;
  asPathFilter: null;
  ipPrefixFilter: null;
  inheritedFromGroup: boolean;
  inheritedGroup: string | null;
  effectiveImportPolicy: string | null;
  effectiveExportPolicy: string | null;
  effectiveNextHopLocal: boolean;
  effectiveAdvertiseCommunity: boolean;
  effectiveAdvertiseExtCommunity: boolean;
  effectivePolicySource: "peer" | "peer_group" | "none";
  source: DrilldownSource;
}

export interface BgpPeerEffectivePolicy {
  afiSafi: BgpAfiSafi;
  vrf: string | null;
  direction: "import" | "export";
  policyName: string;
  source: "peer" | "peer_group";
  inheritedFromGroup: boolean;
  inheritedGroup: string | null;
  status: DependencyStatus;
}

export interface BgpPeerRoutePolicyMatchRef {
  type: PolicyDependencyType | "community-list";
  name: string;
  raw: string;
}

export interface BgpPeerRoutePolicyNodeDrilldown {
  sequence: number | null;
  action: string | null;
  matches: BgpPeerRoutePolicyMatchRef[];
  applies: Array<{ type: string; raw: string }>;
  control: string[];
}

export interface BgpPeerRoutePolicyDrilldown {
  name: string;
  direction: "import" | "export";
  afiSafi: BgpAfiSafi;
  nodes: BgpPeerRoutePolicyNodeDrilldown[];
  dependencies: BgpPeerDependencyEdge[];
  catalogObject?: Record<string, unknown> | null;
  status: DependencyStatus;
}

export interface BgpPeerDependencyEdge {
  fromType: "route-policy" | "bgp_peer";
  fromName: string;
  fromNode: number | null;
  dependencyType: PolicyDependencyType | "community-list" | "route-policy";
  dependencyName: string;
  status: DependencyStatus;
  evidence: string;
  source: DiscoverySource;
  direction?: "import" | "export";
  afiSafi?: BgpAfiSafi;
}

export interface BgpPeerRouteTableSlot {
  requested: boolean;
  available: boolean;
  prefixCount: number | null;
  warning?: string;
}

export interface BgpPeerRouteTableSummary {
  received: BgpPeerRouteTableSlot;
  accepted: BgpPeerRouteTableSlot;
  advertised: BgpPeerRouteTableSlot;
}

export interface RawEvidenceRef {
  id: number | null;
  source: DiscoverySource;
  commandOrScope: string;
  collectedAt: string;
}

export interface BgpPeerDrilldownResult {
  contractVersion: "bgp-peer-drilldown-v1";
  deviceId: number;
  peer: string;
  source: DrilldownSource;
  collectedAt: string;
  configBuildSource: ConfigBuildSource | "unknown";
  snapshotId: number | null;
  root: BgpPeerRootConfig;
  families: BgpPeerFamilyConfig[];
  effectivePolicies: BgpPeerEffectivePolicy[];
  policies: BgpPeerRoutePolicyDrilldown[];
  dependencies: BgpPeerDependencyEdge[];
  runtime: null;
  routeTables: BgpPeerRouteTableSummary;
  warnings: string[];
  rawEvidenceRefs: RawEvidenceRef[];
}

export const EMPTY_ROUTE_TABLES: BgpPeerRouteTableSummary = {
  received: { requested: false, available: false, prefixCount: null },
  accepted: { requested: false, available: false, prefixCount: null },
  advertised: { requested: false, available: false, prefixCount: null },
};

export type DependencyStatus = "FOUND" | "MISSING" | "UNKNOWN" | "ORPHAN";

export type BgpAfiSafi =
  | "ipv4_unicast"
  | "ipv6_unicast"
  | "vpnv4"
  | "vpnv6"
  | "ipv4_vrf"
  | "ipv6_vrf"
  | "unknown";

export type ConfigBuildSource = "raw_config" | "parsed_config_cache" | "snapshot_aggregate" | "unknown";

export type BgpPeerDrilldownCacheStatus = "fresh" | "expired" | "miss" | "recomputed";

export type BgpPeerDrilldownHistoryFreshness = "fresh" | "stale" | "expired";

export interface BgpPeerDrilldownCacheMeta {
  status: BgpPeerDrilldownCacheStatus;
  servedFromCache: boolean;
  rowId: number | null;
  expiresAt: string | null;
  configBuildSource: ConfigBuildSource | string;
}

export interface BgpPeerDrilldownResult {
  contractVersion: string;
  deviceId: number;
  peer: string;
  source: string;
  collectedAt: string;
  configBuildSource: ConfigBuildSource;
  snapshotId: number | null;
  root: {
    peer: string;
    asNumber: number | null;
    description: string | null;
    group: string | null;
    connectInterface: string | null;
    passwordPresent: boolean;
    status: "FOUND" | "MISSING";
  };
  families: Array<{
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
    inheritedFromGroup: boolean;
    inheritedGroup: string | null;
    effectiveImportPolicy: string | null;
    effectiveExportPolicy: string | null;
    effectiveNextHopLocal: boolean;
    effectivePolicySource: "peer" | "peer_group" | "none";
  }>;
  effectivePolicies: Array<{
    afiSafi: BgpAfiSafi;
    vrf: string | null;
    direction: "import" | "export";
    policyName: string;
    source: "peer" | "peer_group";
    inheritedFromGroup: boolean;
    inheritedGroup: string | null;
    status: DependencyStatus;
  }>;
  policies: Array<{
    name: string;
    direction: "import" | "export";
    afiSafi: BgpAfiSafi;
    status: DependencyStatus;
    nodes: Array<{
      sequence: number | null;
      action: string | null;
      matches: Array<{ type: string; name: string; raw: string }>;
      applies: Array<{ type: string; raw: string }>;
    }>;
    dependencies: Array<{
      fromType: string;
      fromName: string;
      fromNode: number | null;
      dependencyType: string;
      dependencyName: string;
      status: DependencyStatus;
      evidence: string;
    }>;
    catalogObject?: Record<string, unknown> | null;
  }>;
  dependencies: Array<{
    fromType: string;
    fromName: string;
    fromNode: number | null;
    dependencyType: string;
    dependencyName: string;
    status: DependencyStatus;
    evidence: string;
    direction?: "import" | "export";
    afiSafi?: BgpAfiSafi;
  }>;
  runtime: null;
  warnings: string[];
  rawEvidenceRefs: Array<{
    id: number | null;
    source: string;
    commandOrScope: string;
    collectedAt: string;
  }>;
  cache?: BgpPeerDrilldownCacheMeta;
}

export type BgpPeerSshDetailStatus = "idle" | "disabled" | "running" | "completed" | "failed";

export interface BgpPeerSshDetailResult {
  contractVersion: string;
  deviceId: number;
  peer: string;
  source: "ssh_detail";
  collectedAt: string;
  requested: {
    includePeerVerbose: boolean;
    includeRoutePolicies: boolean;
    includePolicyObjects: boolean;
  };
  commands: string[];
  evidence: Array<{
    command: string;
    output: string;
    error?: string;
  }>;
  warnings: string[];
}

export interface BgpPeerDrilldownHistoryItem {
  id: number;
  deviceId: number;
  peer: string;
  source: string;
  configBuildSource: ConfigBuildSource | string;
  peerHash: string;
  collectedAt: string;
  expiresAt: string;
  warnings: string[];
  warningsCount: number;
  freshnessStatus: BgpPeerDrilldownHistoryFreshness;
  createdAt: string;
}

export interface BgpPeerDrilldownHistoryCompareResult {
  left: { id: number; collectedAt: string; configBuildSource: string };
  right: { id: number; collectedAt: string; configBuildSource: string };
  importPolicyChanges: Array<{ afiSafi: string; vrf: string | null; left: string | null; right: string | null }>;
  exportPolicyChanges: Array<{ afiSafi: string; vrf: string | null; left: string | null; right: string | null }>;
  enabledFamilyChanges: Array<{ afiSafi: string; vrf: string | null; left: boolean; right: boolean }>;
  warningsAdded: string[];
  warningsRemoved: string[];
}

export interface BgpPeerDrilldownHistoryCompareResponse {
  deviceId: number;
  peer: string;
  compare: BgpPeerDrilldownHistoryCompareResult;
}

export interface BgpPeerDrilldownHistoryResponse {
  deviceId: number;
  peer: string;
  items: BgpPeerDrilldownHistoryItem[];
}

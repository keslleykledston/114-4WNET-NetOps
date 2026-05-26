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
}

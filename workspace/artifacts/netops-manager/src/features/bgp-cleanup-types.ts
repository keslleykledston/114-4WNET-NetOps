export type BgpPeerCleanupRecommendation = "full" | "partial" | "skip";
export type BgpPeerCleanupRisk = "low" | "medium" | "high";
export type BgpPeerCleanupDependencyStatus = "exclusive" | "shared" | "global" | "ambiguous";
export type BgpPeerCleanupDependencyType =
  | "route-policy"
  | "ip-prefix"
  | "ipv6-prefix"
  | "community-filter"
  | "as-path-filter"
  | "extcommunity-filter"
  | "acl";

export interface BgpPeerCleanupDependency {
  type: BgpPeerCleanupDependencyType;
  name: string;
  status: BgpPeerCleanupDependencyStatus;
  users: Array<{
    peerIp: string;
    state: string;
    vrf: string | null;
    afi: string;
    safi: string;
  }>;
  evidence: string;
  reason?: string | null;
}

export interface BgpPeerCleanupScript {
  removalCommands: string[];
  validationBefore: string[];
  validationAfter: string[];
  sha256: string;
}

export interface BgpPeerCleanupSshRefresh {
  enabled: boolean;
  commandCount: number;
  executedCount: number;
  commands: string[];
  warnings: string[];
  evidence: Array<{
    command: string;
    output: string;
    error?: string;
  }>;
}

export interface BgpPeerCleanupTwinPeer {
  peerIp: string;
  state: string;
  afi: string;
  vrf: string | null;
  remoteAs: number | null;
}

export interface BgpPeerCleanupAnalysis {
  analysisId: number;
  deviceId: number;
  peerIp: string;
  vrf: string | null;
  afi: string;
  safi: string;
  peerRole: string | null;
  peerCategory: string | null;
  state: string;
  peerAs: number | null;
  localAs: number | null;
  importPolicies: string[];
  exportPolicies: string[];
  recommendation: BgpPeerCleanupRecommendation;
  riskLevel: BgpPeerCleanupRisk;
  dependencies: {
    exclusive: BgpPeerCleanupDependency[];
    shared: BgpPeerCleanupDependency[];
    global: BgpPeerCleanupDependency[];
    ambiguous: BgpPeerCleanupDependency[];
  };
  script: BgpPeerCleanupScript;
  sshRefresh?: BgpPeerCleanupSshRefresh | null;
  warnings: string[];
  blockedReasons: string[];
  twin?: BgpPeerCleanupTwinPeer | null;
  collectedAt: string | null;
  snapshotSource: string;
  changePlanId?: number | null;
}

export interface BgpPeerCleanupExportResponse {
  analysisId: number;
  markdown: string;
  exportedAt: string;
}

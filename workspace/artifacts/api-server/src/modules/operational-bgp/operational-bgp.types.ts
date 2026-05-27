export type BgpFreshnessStatus = "fresh" | "stale" | "expired" | "unknown";

export type BgpMibCollector = "rfc4273" | "bgp4v2" | "huawei";

export const BGP_MIB_COLLECTOR_ORDER: readonly BgpMibCollector[] = ["rfc4273", "bgp4v2", "huawei"] as const;

export type OperationalBgpPeerDto = {
  peerIp: string;
  peerAs: number | null;
  peerType: string;
  vrf: string | null;
  afi: string;
  safi: string;
  adminStatus: string;
  operStatus: string;
  fsmState: string;
  uptimeSeconds: number | null;
  receivedPrefixes: number | null;
  acceptedPrefixes: number | null;
  advertisedPrefixes: number | null;
  lastChange: string | null;
  collectedAt: string;
};

export type OperationalBgpListResponse = {
  deviceId: number;
  peers: OperationalBgpPeerDto[];
  freshness: BgpFreshnessStatus;
  collectedAt: string | null;
  jobId: number | null;
};

export type OperationalBgpSummaryResponse = {
  deviceId: number;
  total: number;
  freshness: BgpFreshnessStatus;
  collectedAt: string | null;
  counts: {
    up: number;
    down: number;
    idle: number;
    active: number;
    unknown: number;
  };
};

export type OperationalBgpCollectResult = {
  deviceId: number;
  jobId: number;
  status: string;
  peerCount: number;
  collectorUsed: BgpMibCollector | null;
  collectedAt: string;
  freshness: BgpFreshnessStatus;
  stub: boolean;
  errorCode: string | null;
};

export type CollectedBgpPeerRow = {
  peerIp: string;
  peerAs: number | null;
  peerType: string;
  vrf: string | null;
  afi: string;
  safi: string;
  adminStatus: string;
  operStatus: string;
  fsmState: string;
  uptimeSeconds: number | null;
  receivedPrefixes: number | null;
  acceptedPrefixes: number | null;
  advertisedPrefixes: number | null;
  lastChange: Date | null;
};

export type CollectBgpPeersResult = {
  peers: CollectedBgpPeerRow[];
  collectorUsed: BgpMibCollector | null;
  warnings: string[];
  stub: boolean;
};

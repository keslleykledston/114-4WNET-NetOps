import { useQuery } from "@tanstack/react-query";

export type BgpFreshnessStatus = "fresh" | "stale" | "expired" | "unknown";

export type OperationalBgpPeer = {
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

export type OperationalBgpPeersResponse = {
  deviceId: number;
  peers: OperationalBgpPeer[];
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

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function operationalBgpPeersQueryKey(deviceId: number | null) {
  return ["operational-bgp-peers", deviceId ?? "none"] as const;
}

export function operationalBgpSummaryQueryKey(deviceId: number | null) {
  return ["operational-bgp-summary", deviceId ?? "none"] as const;
}

export function useOperationalBgpPeers(deviceId: number | null) {
  return useQuery({
    queryKey: operationalBgpPeersQueryKey(deviceId),
    queryFn: () => apiFetch<OperationalBgpPeersResponse>(`/api/operational/bgp?device_id=${deviceId}`),
    enabled: deviceId != null && deviceId > 0,
  });
}

export function useOperationalBgpSummary(deviceId: number | null) {
  return useQuery({
    queryKey: operationalBgpSummaryQueryKey(deviceId),
    queryFn: () => apiFetch<OperationalBgpSummaryResponse>(`/api/operational/bgp/summary?device_id=${deviceId}`),
    enabled: deviceId != null && deviceId > 0,
  });
}

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  BgpPeerDrilldownHistoryCompareResponse,
  BgpPeerDrilldownHistoryResponse,
  BgpPeerDrilldownResult,
  BgpPeerSshDetailResult,
} from "./types";

export interface BgpPeerDrilldownParams {
  deviceId: number;
  peer: string;
  source?: "snapshot";
  includePolicies?: boolean;
  includePolicyObjects?: boolean;
  snapshotId?: number;
  jobId?: number;
  forceRecompute?: boolean;
  enabled?: boolean;
}

function drilldownPath(deviceId: number, peer: string, params: BgpPeerDrilldownParams): string {
  const q = new URLSearchParams();
  q.set("source", params.source ?? "snapshot");
  q.set("include_policies", params.includePolicies === false ? "false" : "true");
  q.set("include_policy_objects", params.includePolicyObjects === false ? "false" : "true");
  if (params.snapshotId) q.set("snapshot_id", String(params.snapshotId));
  if (params.jobId) q.set("job_id", String(params.jobId));
  if (params.forceRecompute) q.set("force_recompute", "true");
  return `/api/bgp/peers/${deviceId}/${encodeURIComponent(peer)}/drilldown?${q.toString()}`;
}

async function fetchBgpPeerDrilldown(params: BgpPeerDrilldownParams): Promise<BgpPeerDrilldownResult> {
  const res = await fetch(drilldownPath(params.deviceId, params.peer, params), {
    credentials: "include",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Drilldown failed (${res.status})`);
  }
  return res.json() as Promise<BgpPeerDrilldownResult>;
}

export function bgpPeerDrilldownQueryKey(params: BgpPeerDrilldownParams) {
  return [
    "bgp-peer-drilldown",
    params.deviceId,
    params.peer,
    params.source ?? "snapshot",
    params.snapshotId ?? null,
    params.jobId ?? null,
    params.includePolicies !== false,
    params.includePolicyObjects !== false,
    params.forceRecompute === true,
  ] as const;
}

export function useBgpPeerDrilldown(params: BgpPeerDrilldownParams) {
  const enabled = (params.enabled ?? true) && params.deviceId > 0 && params.peer.trim().length > 0;
  return useQuery({
    queryKey: bgpPeerDrilldownQueryKey(params),
    queryFn: () => fetchBgpPeerDrilldown(params),
    enabled,
    staleTime: 60_000,
  });
}

export interface BgpPeerDrilldownHistoryParams {
  deviceId: number;
  peer: string;
  enabled?: boolean;
  limit?: number;
}

async function fetchBgpPeerDrilldownHistory(params: BgpPeerDrilldownHistoryParams): Promise<BgpPeerDrilldownHistoryResponse> {
  const q = new URLSearchParams();
  if (params.limit) q.set("limit", String(params.limit));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  const res = await fetch(`/api/bgp/peers/${params.deviceId}/${encodeURIComponent(params.peer)}/drilldown/history${suffix}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `History failed (${res.status})`);
  }
  return res.json() as Promise<BgpPeerDrilldownHistoryResponse>;
}

export function useBgpPeerDrilldownHistory(params: BgpPeerDrilldownHistoryParams) {
  const enabled = (params.enabled ?? true) && params.deviceId > 0 && params.peer.trim().length > 0;
  return useQuery({
    queryKey: ["bgp-peer-drilldown-history", params.deviceId, params.peer, params.limit ?? 20],
    queryFn: () => fetchBgpPeerDrilldownHistory(params),
    enabled,
    staleTime: 30_000,
  });
}

export interface BgpPeerDrilldownHistoryCompareParams {
  deviceId: number;
  peer: string;
  leftId: number;
  rightId: number;
  enabled?: boolean;
}

async function fetchBgpPeerDrilldownHistoryCompare(
  params: BgpPeerDrilldownHistoryCompareParams,
): Promise<BgpPeerDrilldownHistoryCompareResponse> {
  const q = new URLSearchParams({
    left: String(params.leftId),
    right: String(params.rightId),
  });
  const res = await fetch(
    `/api/bgp/peers/${params.deviceId}/${encodeURIComponent(params.peer)}/drilldown/history/compare?${q.toString()}`,
    { credentials: "include" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `History compare failed (${res.status})`);
  }
  return res.json() as Promise<BgpPeerDrilldownHistoryCompareResponse>;
}

export function useBgpPeerDrilldownHistoryCompare(params: BgpPeerDrilldownHistoryCompareParams) {
  const enabled = (params.enabled ?? true) && params.deviceId > 0 && params.peer.trim().length > 0
    && params.leftId > 0 && params.rightId > 0 && params.leftId !== params.rightId;
  return useQuery({
    queryKey: ["bgp-peer-drilldown-history-compare", params.deviceId, params.peer, params.leftId, params.rightId],
    queryFn: () => fetchBgpPeerDrilldownHistoryCompare(params),
    enabled,
    staleTime: 60_000,
  });
}

export interface BgpPeerSshDetailParams {
  deviceId: number;
  peer: string;
}

export class BgpPeerSshDetailError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "BgpPeerSshDetailError";
    this.status = status;
    this.code = code;
  }
}

async function fetchBgpPeerSshDetail(params: BgpPeerSshDetailParams): Promise<BgpPeerSshDetailResult> {
  const res = await fetch(`/api/bgp/peers/${params.deviceId}/${encodeURIComponent(params.peer)}/drilldown/detail`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      includePeerVerbose: true,
      includeRoutePolicies: true,
      includePolicyObjects: true,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new BgpPeerSshDetailError(body.message ?? body.error ?? `SSH detail failed (${res.status})`, res.status, body.error);
  }
  return res.json() as Promise<BgpPeerSshDetailResult>;
}

export function useBgpPeerSshDetail() {
  return useMutation({
    mutationFn: fetchBgpPeerSshDetail,
  });
}

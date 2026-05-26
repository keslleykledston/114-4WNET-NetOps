import { useMutation, useQuery } from "@tanstack/react-query";
import type { BgpPeerDrilldownResult, BgpPeerSshDetailResult } from "./types";

export interface BgpPeerDrilldownParams {
  deviceId: number;
  peer: string;
  source?: "snapshot";
  includePolicies?: boolean;
  includePolicyObjects?: boolean;
  snapshotId?: number;
  jobId?: number;
  enabled?: boolean;
}

function drilldownPath(deviceId: number, peer: string, params: BgpPeerDrilldownParams): string {
  const q = new URLSearchParams();
  q.set("source", params.source ?? "snapshot");
  q.set("include_policies", params.includePolicies === false ? "false" : "true");
  q.set("include_policy_objects", params.includePolicyObjects === false ? "false" : "true");
  if (params.snapshotId) q.set("snapshot_id", String(params.snapshotId));
  if (params.jobId) q.set("job_id", String(params.jobId));
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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type L2CircuitType =
  | "vlan"
  | "dot1q_subif"
  | "vlan_local"
  | "vlan_orphan"
  | "l2vc"
  | "vpws"
  | "vsi"
  | "vpls"
  | "l3_vrf_link"
  | "l3_interface"
  | "config_only";

export type L2Status = "UP" | "DOWN" | "PARTIAL" | "UNKNOWN" | "CONFIG_ONLY";

export type L2OperationalFreshness = "fresh" | "stale" | "expired" | "unknown";

export interface L2OperationalSummary {
  device_id: number;
  last_refresh_at: string | null;
  freshness: L2OperationalFreshness;
  operational_state?: Record<string, unknown>;
}

export type L2FindingCode =
  | "CIRCUIT_DOWN"
  | "L2VC_DOWN"
  | "VSI_DOWN"
  | "PW_PARTIAL_DOWN"
  | "REMOTE_NOT_FORWARDING"
  | "INCOMPLETE_L2_CONFIG"
  | "DUPLICATED_VC_ID"
  | "VLAN_CONFLICT"
  | "DESCRIPTION_MISSING"
  | "ROUTER_L2_VLAN_ANOMALY"
  | "VLAN_ORPHAN"
  | "VLANIF_ORPHAN"
  | "VLAN_NOT_IN_SWITCH_BATCH"
  | "VLAN_MULTI_INTERFACE_LOCAL"
  | "VLAN_USED_IN_L2VC"
  | "VLAN_USED_IN_VSI"
  | "VLAN_USED_IN_L3_VRF"
  | "CLASSIFICATION_CONFLICT";

export interface L2Finding {
  code: L2FindingCode;
  severity: "info" | "warning" | "error";
  message: string;
}

export interface L2VsiPeer {
  peer_ip: string;
  session_state?: string;
  pw_state?: string;
  vc_label?: string;
  local_vc_label?: string;
  remote_vc_label?: string;
  tunnel_id?: string;
  out_interface?: string;
  last_up_time?: string;
  primary?: boolean;
}

export interface L2PwSummary {
  total: number;
  up: number;
  down: number;
  unknown: number;
}

export interface L2Circuit {
  id: number;
  deviceId: number;
  circuitType: L2CircuitType;
  serviceId?: string | null;
  name: string;
  description?: string | null;
  outerVlan?: number | null;
  innerVlan?: number | null;
  vcId?: string | null;
  vsiName?: string | null;
  vsiId?: string | null;
  localInterface?: string | null;
  parentInterface?: string | null;
  peerIp?: string | null;
  primaryPeerIp?: string | null;
  peerIps?: string[] | null;
  peers?: L2VsiPeer[] | null;
  pwSummary?: L2PwSummary | null;
  adminStatus: L2Status;
  operStatus: L2Status;
  pwStatus?: string | null;
  macCount?: number | null;
  source: "ssh_live" | "cached_config";
  rawEvidence?: string | null;
  classification?: string | null;
  l2Transport?: string | null;
  deviceRoleFamily?: string | null;
  evidenceFlags?: unknown;
  anomalyTags?: string[] | null;
  roleContext?: string | null;
  findings: L2Finding[];
  firstSeen: string;
  lastSeen: string;
  discoveryRunId: string;
  createdAt: string;
  updatedAt: string;
}

export interface L2CircuitListResponse {
  circuits: L2Circuit[];
  total: number;
  operational?: L2OperationalSummary;
}

export interface L2OperationalRefreshResponse {
  device_id: number;
  last_refresh_at: string;
  freshness: L2OperationalFreshness;
  circuits_updated: number;
  findings_count: number;
  operational_state: Record<string, unknown>;
  warnings: string[];
}

export interface L2OperationalRefreshStartResponse {
  run_id: string;
  device_id: number;
  status: "running";
  started_at: string;
}

export interface L2OperationalRefreshJobResponse {
  run_id: string;
  device_id: number;
  status: "pending" | "running" | "completed" | "failed";
  started_at: string;
  finished_at: string | null;
  circuits_updated: number | null;
  findings_count: number | null;
  error_message: string | null;
  last_refresh_at?: string | null;
  freshness?: L2OperationalFreshness;
  operational_state?: Record<string, unknown>;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", cache: "no-store", ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    const err = new Error(body.error ?? `HTTP ${res.status}`) as Error & { code?: string; status?: number };
    err.code = body.code;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function fetchL2Circuits(params?: { deviceId?: number }) {
  const qs = new URLSearchParams();
  if (params?.deviceId) qs.set("device_id", String(params.deviceId));
  const query = qs.toString();
  return apiFetch<L2CircuitListResponse>(`/api/l2-circuits${query ? `?${query}` : ""}`);
}

export function fetchL2Circuit(id: number) {
  return apiFetch<L2Circuit>(`/api/l2-circuits/${id}`);
}

export function l2CircuitsQueryKey(deviceId?: number) {
  return ["l2-circuits", deviceId ?? "all"] as const;
}

export function useL2Circuits(deviceId?: number) {
  return useQuery({
    queryKey: l2CircuitsQueryKey(deviceId),
    queryFn: () => fetchL2Circuits(deviceId ? { deviceId } : undefined),
  });
}

export function useL2Circuit(id: number | null) {
  return useQuery({
    queryKey: ["l2-circuit", id],
    queryFn: () => fetchL2Circuit(id!),
    enabled: id != null && id > 0,
  });
}

function readJobCount(job: L2OperationalRefreshJobResponse, key: "circuits_updated" | "findings_count"): number {
  const operational = job.operational_state ?? {};
  if (key === "circuits_updated") {
    return (
      job.circuits_updated ??
      (typeof operational.circuits_updated === "number" ? operational.circuits_updated : null) ??
      (typeof operational.circuits_total === "number" ? operational.circuits_total : null) ??
      0
    );
  }
  return (
    job.findings_count ??
    (typeof operational.findings_count === "number" ? operational.findings_count : null) ??
    0
  );
}

export function startL2OperationalRefresh(deviceId: number) {
  return fetch("/api/l2-circuits/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId }),
    credentials: "include",
    cache: "no-store",
  }).then(async (res) => {
    if (res.status !== 202) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      const err = new Error(body.error ?? `HTTP ${res.status}`) as Error & { code?: string; status?: number };
      err.code = body.code;
      err.status = res.status;
      throw err;
    }
    return res.json() as Promise<L2OperationalRefreshStartResponse>;
  });
}

export function fetchL2RefreshJob(runId: string) {
  return apiFetch<L2OperationalRefreshJobResponse>(`/api/l2-circuits/refresh-jobs/${encodeURIComponent(runId)}`);
}

async function waitForL2RefreshJob(
  runId: string,
  timeoutMs = 20 * 60 * 1000,
): Promise<L2OperationalRefreshJobResponse> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await fetchL2RefreshJob(runId);
    if (job.status !== "running" && job.status !== "pending") {
      return job;
    }
    await sleep(3000);
  }
  throw new Error("Refresh operacional expirou aguardando conclusão");
}

export async function refreshL2Circuits(deviceId: number) {
  const started = await startL2OperationalRefresh(deviceId);
  const job = await waitForL2RefreshJob(started.run_id);
  if (job.status === "failed") {
    throw new Error(job.error_message ?? "Refresh operacional falhou");
  }
  return {
    device_id: job.device_id,
    last_refresh_at: job.last_refresh_at ?? started.started_at,
    freshness: job.freshness ?? "unknown",
    circuits_updated: readJobCount(job, "circuits_updated"),
    findings_count: readJobCount(job, "findings_count"),
    operational_state: job.operational_state ?? {},
    warnings: [],
  } satisfies L2OperationalRefreshResponse;
}

export function formatL2OperationalRefreshToast(result: L2OperationalRefreshResponse): string {
  const circuits = result.circuits_updated ?? 0;
  const findings = result.findings_count ?? 0;
  const freshness = result.freshness ?? "unknown";
  return `${circuits} circuitos · ${findings} findings · ${freshness}`;
}

export function useRefreshL2Circuits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: number) => refreshL2Circuits(deviceId),
    onSuccess: (_data, deviceId) => {
      void queryClient.invalidateQueries({ queryKey: l2CircuitsQueryKey(deviceId) });
      void queryClient.invalidateQueries({ queryKey: l2CircuitsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: ["l2-circuit"] });
    },
  });
}

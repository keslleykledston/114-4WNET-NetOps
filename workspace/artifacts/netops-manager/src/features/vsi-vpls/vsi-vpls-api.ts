import { useQuery } from "@tanstack/react-query";

export type VsiVplsStatus = "UP" | "DEGRADED" | "DOWN" | "CONFIG_ONLY" | "UNKNOWN";

export interface VsiVplsServiceSummary {
  id: string;
  tenant_id: number | null;
  tenant_name: string;
  vs_id: string | null;
  name: string;
  normalized_name: string;
  status: VsiVplsStatus;
  severity: "info" | "warning" | "error";
  sites_count: number;
  devices_count: number;
  acs_count: number;
  pws_count: number;
  pws_up_count: number;
  alarms_count: number;
  has_divergence: boolean;
  last_collected_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

export interface VsiVplsMemberRecord {
  device_id: number;
  device_name: string;
  site: string;
  tenant_id: number | null;
  tenant_name: string | null;
  vendor: string;
  circuit_id: number;
  circuit_type: "vsi" | "vpls";
  name: string;
  normalized_name: string;
  vs_id: string | null;
  vsi_name: string | null;
  source: string;
  admin_status: VsiVplsStatus | "PARTIAL" | "UNKNOWN" | "UP" | "DOWN" | "CONFIG_ONLY";
  oper_status: VsiVplsStatus | "PARTIAL" | "UNKNOWN" | "UP" | "DOWN" | "CONFIG_ONLY";
  pw_status: string | null;
  local_interface: string | null;
  parent_interface: string | null;
  peer_ip: string | null;
  peer_ips: string[];
  peers: Array<{ peer_ip: string; pw_state?: string; session_state?: string; last_up_time?: string; primary?: boolean }>;
  pw_summary: { total: number; up: number; down: number; unknown: number } | null;
  outer_vlan: number | null;
  inner_vlan: number | null;
  mac_count: number | null;
  findings: Array<{ code: string; severity: "info" | "warning" | "error"; message: string }>;
  first_seen: string;
  last_seen: string;
  raw_evidence: string | null;
}

export interface VsiVplsConfigRecord {
  device_id: number;
  device_name: string;
  site: string;
  tenant_id: number | null;
  tenant_name: string | null;
  collected_at: string;
  parser_status: string | null;
  source: string | null;
  raw_config: string | null;
}

export interface VsiVplsAlarmRecord {
  device_id: number;
  device_name: string;
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  source: string;
}

export interface VsiVplsHistoryRecord {
  id: string;
  event_type: "member_seen" | "config_collected" | "status_snapshot";
  status?: VsiVplsStatus;
  severity?: "info" | "warning" | "error";
  reason: string;
  created_at: string;
}

export interface VsiVplsDetailResponse {
  service: VsiVplsServiceSummary;
  members: VsiVplsMemberRecord[];
  configs_metadata: VsiVplsConfigRecord[];
  alarms: VsiVplsAlarmRecord[];
  history_summary: VsiVplsHistoryRecord[];
  diagnosis: { status: VsiVplsStatus; severity: "info" | "warning" | "error"; reason: string; evidence: string[] };
  acs: Array<{ device_id: number; interface_name: string; vlan_id: number | null; qinq_outer_vlan: number | null; qinq_inner_vlan: number | null }>;
  pseudowires: Array<{
    device_id: number;
    peer_ip: string | null;
    pw_id: string | null;
    vsi_id: string | null;
    status: string | null;
    uptime: string | null;
    last_down_reason: string | null;
  }>;
}

export interface VsiVplsListResponse {
  services: VsiVplsServiceSummary[];
  total: number;
}

export interface VsiVplsListFilter {
  tenant_id?: number;
  vs_id?: string;
  name?: string;
  site_id?: string;
  device_id?: number;
  status?: VsiVplsStatus;
  has_alarm?: boolean;
  has_divergence?: boolean;
  last_collected_from?: string;
  last_collected_to?: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json() as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function fetchVsiVplsList(filters?: VsiVplsListFilter) {
  const query = new URLSearchParams();
  if (filters?.tenant_id != null) query.set("tenant_id", String(filters.tenant_id));
  if (filters?.vs_id) query.set("vs_id", filters.vs_id);
  if (filters?.name) query.set("name", filters.name);
  if (filters?.site_id) query.set("site_id", filters.site_id);
  if (filters?.device_id != null) query.set("device_id", String(filters.device_id));
  if (filters?.status) query.set("status", filters.status);
  if (filters?.has_alarm != null) query.set("has_alarm", String(filters.has_alarm));
  if (filters?.has_divergence != null) query.set("has_divergence", String(filters.has_divergence));
  if (filters?.last_collected_from) query.set("last_collected_from", filters.last_collected_from);
  if (filters?.last_collected_to) query.set("last_collected_to", filters.last_collected_to);
  const qs = query.toString();
  return apiFetch<VsiVplsListResponse>(`/api/l2/vsi-vpls${qs ? `?${qs}` : ""}`);
}

export function fetchVsiVplsDetail(id: string) {
  return apiFetch<VsiVplsDetailResponse>(`/api/l2/vsi-vpls/${encodeURIComponent(id)}`);
}

export function useVsiVplsList(filters?: VsiVplsListFilter) {
  return useQuery({
    queryKey: ["vsi-vpls", filters ?? {}],
    queryFn: () => fetchVsiVplsList(filters),
  });
}

export function useVsiVplsDetail(id: string | null) {
  return useQuery({
    queryKey: ["vsi-vpls-detail", id],
    queryFn: () => fetchVsiVplsDetail(id!),
    enabled: Boolean(id),
  });
}

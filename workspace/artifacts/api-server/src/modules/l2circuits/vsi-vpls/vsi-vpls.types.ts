import type { L2Finding, L2PwSummary, L2Status, L2VsiPeer } from "../l2circuits.types.js";

export type VsiVplsStatus = "UP" | "DEGRADED" | "DOWN" | "CONFIG_ONLY" | "UNKNOWN";

export interface VsiVplsStatusResult {
  status: VsiVplsStatus;
  severity: "info" | "warning" | "error";
  reason: string;
  evidence: string[];
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
  admin_status: L2Status;
  oper_status: L2Status;
  pw_status: string | null;
  local_interface: string | null;
  parent_interface: string | null;
  peer_ip: string | null;
  peer_ips: string[];
  peers: L2VsiPeer[];
  pw_summary: L2PwSummary | null;
  outer_vlan: number | null;
  inner_vlan: number | null;
  mac_count: number | null;
  findings: L2Finding[];
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

export interface VsiVplsDetailResponse {
  service: VsiVplsServiceSummary;
  members: VsiVplsMemberRecord[];
  configs_metadata: VsiVplsConfigRecord[];
  alarms: VsiVplsAlarmRecord[];
  history_summary: VsiVplsHistoryRecord[];
  diagnosis: VsiVplsStatusResult;
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
  tenantId?: number;
  vsId?: string;
  name?: string;
  site?: string;
  deviceId?: number;
  status?: VsiVplsStatus;
  hasAlarm?: boolean;
  hasDivergence?: boolean;
  lastCollectedFrom?: string;
  lastCollectedTo?: string;
}

import { useQuery } from "@tanstack/react-query";

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

export type L2FindingCode =
  | "CIRCUIT_DOWN"
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
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
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

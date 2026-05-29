export type L2CircuitType = "vlan" | "dot1q_subif" | "vlan_local" | "vlan_orphan" | "l2vc" | "vpws" | "vsi" | "vpls" | "l3_vrf_link" | "l3_interface" | "config_only";
export type L2Classification = "vlan_orphan" | "vlanif_orphan" | "vlan_not_in_switch_batch" | "vlan_local" | "switching_vlan" | "vpws" | "l2vc" | "vsi" | "vpls" | "l3_vrf_link" | "l3_interface" | "router_l2_vlan_anomaly" | "classification_conflict" | "config_only";
export type L2Transport = "local_vlan" | "pseudowire" | "multipoint" | "l3" | "config_only" | "none";
export type L2DeviceRoleFamily = "ROUTER" | "SWITCH" | "UNKNOWN";
export type L2Status = "UP" | "DOWN" | "PARTIAL" | "UNKNOWN" | "CONFIG_ONLY";
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
  | "VLAN_MULTI_INTERFACE_LOCAL"
  | "VLAN_USED_IN_L2VC"
  | "VLAN_USED_IN_VSI"
  | "VLAN_USED_IN_L3_VRF"
  | "VLANIF_ORPHAN"
  | "VLAN_NOT_IN_SWITCH_BATCH"
  | "CLASSIFICATION_CONFLICT";
export type L2FindingSeverity = "info" | "warning" | "error";

export interface L2Finding {
  code: L2FindingCode;
  severity: L2FindingSeverity;
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

export interface ParsedL2Circuit {
  circuitType: L2CircuitType;
  serviceId?: string;
  name: string;
  description?: string;
  outerVlan?: number;
  innerVlan?: number;
  vcId?: string;
  vsiName?: string;
  vsiId?: string;
  localInterface?: string;
  parentInterface?: string;
  peerIp?: string;
  /** All peer IPs for multipoint VSI/VPLS. */
  peerIps?: string[];
  primaryPeerIp?: string;
  vsiState?: string;
  peers?: L2VsiPeer[];
  pwSummary?: L2PwSummary;
  adminStatus?: string;
  operStatus?: string;
  pwStatus?: string;
  acStatus?: string;
  sessionState?: string;
  remoteForwardingState?: string;
  macCount?: number;
  rawEvidence: string;
  classification?: L2Classification;
  l2Transport?: L2Transport;
  deviceRoleFamily?: L2DeviceRoleFamily;
  evidenceFlags?: {
    hasDot1q?: boolean;
    hasVcId?: boolean;
    hasPeer?: boolean;
    hasVsi?: boolean;
    hasIp?: boolean;
    hasIpv4?: boolean;
    hasIpv6?: boolean;
    hasIpv6Enable?: boolean;
    hasOspf?: boolean;
    hasIsis?: boolean;
    hasBgp?: boolean;
    hasRip?: boolean;
    hasMpls?: boolean;
    hasVrf?: boolean;
    hasVlanif?: boolean;
    hasMac?: boolean;
    hasBridge?: boolean;
    hasL2Binding?: boolean;
    hasVeGroup?: boolean;
    hasBridgeDomain?: boolean;
    hasDescription?: boolean;
    hasMtu?: boolean;
    hasStatisticEnable?: boolean;
    hasSwitchingUse?: boolean;
    vlanDeclaredGlobal?: boolean;
    vsiPeers?: L2VsiPeer[];
    pwSummary?: L2PwSummary;
    vsiState?: string;
    peerIps?: string[];
    primaryPeerIp?: string;
  };
  anomalyTags?: string[];
  roleContext?: string;
}

export interface NormalizedL2Status {
  adminStatus: L2Status;
  operStatus: L2Status;
  pwStatus?: L2Status;
}

export interface NormalizedL2Circuit extends ParsedL2Circuit {
  adminStatus: L2Status;
  operStatus: L2Status;
  findings: L2Finding[];
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
  firstSeen: Date;
  lastSeen: Date;
  discoveryRunId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface L2DiscoveryJob {
  id: number;
  runId: string;
  deviceId: number;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: Date;
  finishedAt?: Date | null;
  circuitCount?: number | null;
  findingsCount?: number | null;
  errorMessage?: string | null;
  createdAt: Date;
}

export interface DiscoverL2CircuitsRequest {
  device_id: number;
}

export interface DiscoverL2CircuitsResponse {
  run_id: string;
  status: "pending" | "running";
  started_at: string;
}

export interface L2CircuitListFilter {
  deviceId?: number;
  circuitType?: L2CircuitType;
  status?: L2Status;
  vcId?: string;
  vsiName?: string;
  limit?: number;
  offset?: number;
}

export type L2OperationalFreshnessStatus = "fresh" | "stale" | "expired" | "unknown";

export interface L2OperationalSummary {
  device_id: number;
  last_refresh_at: string | null;
  freshness: L2OperationalFreshnessStatus;
  operational_state?: Record<string, unknown>;
}

export interface L2CircuitListResponse {
  circuits: L2Circuit[];
  total: number;
  limit?: number;
  offset?: number;
  operational?: L2OperationalSummary;
}

export interface L2OperationalRefreshRequest {
  device_id: number;
}

export interface L2OperationalRefreshResponse {
  device_id: number;
  last_refresh_at: string;
  freshness: L2OperationalFreshnessStatus;
  circuits_updated: number;
  findings_count: number;
  operational_state: Record<string, unknown>;
  warnings: string[];
}

export interface L2DiscoveryJobResponse {
  run_id: string;
  device_id: number;
  status: "pending" | "running" | "completed" | "failed";
  started_at: string;
  finished_at?: string | null;
  circuit_count?: number | null;
  findings_count?: number | null;
  error_message?: string | null;
  circuits?: L2Circuit[];
}

export interface SSHCollectorOutput extends Record<string, string | undefined> {
  "display mpls l2vc verbose"?: string;
  "display mpls l2vc"?: string;
  "display vsi verbose"?: string;
  "display interface brief"?: string;
  "display interface description"?: string;
  "display current-configuration interface"?: string;
  "display ip interface brief"?: string;
  "display ip vpn-instance"?: string;
  "display vlan"?: string;
  "display mac-address vsi"?: string;
  "display mac-address vlan"?: string;
}

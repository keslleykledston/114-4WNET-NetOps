export type L2CircuitType = "vlan" | "dot1q_subif" | "l2vc" | "vpws" | "vsi" | "vpls";
export type L2Status = "UP" | "DOWN" | "PARTIAL" | "UNKNOWN" | "CONFIG_ONLY";
export type L2FindingCode = "CIRCUIT_DOWN" | "INCOMPLETE_L2_CONFIG" | "DUPLICATED_VC_ID" | "VLAN_CONFLICT" | "DESCRIPTION_MISSING";
export type L2FindingSeverity = "info" | "warning" | "error";

export interface L2Finding {
  code: L2FindingCode;
  severity: L2FindingSeverity;
  message: string;
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
  adminStatus?: string;
  operStatus?: string;
  pwStatus?: string;
  macCount?: number;
  rawEvidence: string;
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
  adminStatus: L2Status;
  operStatus: L2Status;
  pwStatus?: string | null;
  macCount?: number | null;
  source: "ssh_live" | "cached_config";
  rawEvidence?: string | null;
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

export interface L2CircuitListResponse {
  circuits: L2Circuit[];
  total: number;
  limit: number;
  offset: number;
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
  "display vsi verbose"?: string;
  "display interface brief"?: string;
  "display interface description"?: string;
  "display current-configuration interface"?: string;
  "display mac-address vsi"?: string;
  "display mac-address vlan"?: string;
}

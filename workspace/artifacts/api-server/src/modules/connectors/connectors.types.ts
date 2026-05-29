export const CONNECTOR_STATUSES = ["PENDING", "ONLINE", "OFFLINE", "DISABLED", "REVOKED"] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

export const CONNECTOR_JOB_TYPES = [
  "PING",
  "TRACEROUTE",
  "TCP_CHECK",
  "SSH_COMMAND",
  "SNMP_GET",
  "SNMP_WALK",
  "ROUTE_CHECK",
  "WG_STATUS",
] as const;
export type ConnectorJobType = (typeof CONNECTOR_JOB_TYPES)[number];

export const CONNECTOR_JOB_STATUSES = [
  "PENDING",
  "RUNNING",
  "SUCCESS",
  "FAILED",
  "TIMEOUT",
  "CANCELLED",
] as const;
export type ConnectorJobStatus = (typeof CONNECTOR_JOB_STATUSES)[number];

export type ConnectorHeartbeatPayload = {
  connector_name: string;
  status: string;
  version?: string;
  wireguard_status?: string;
  lan_ip?: string;
  wg_ip?: string;
  routes_count?: number;
  nat_enabled?: boolean;
  cpu_usage?: number;
  memory_usage?: number;
};

export type ConnectorJobResultPayload = {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  result_json?: Record<string, unknown>;
};

export type CreateConnectorInput = {
  tenant_id: number;
  name: string;
  description?: string | null;
  wireguard_ip?: string | null;
  wireguard_endpoint?: string | null;
  wireguard_allowed_ips?: string | null;
  networks?: Array<{ network_cidr: string; description?: string | null }>;
};

export type CreateConnectorJobInput = {
  connector_id: number;
  job_type: ConnectorJobType;
  target_ip?: string | null;
  target_port?: number | null;
  payload_json?: Record<string, unknown>;
  timeout_seconds?: number;
  created_by?: number | null;
};

export type ConnectorPublicView = {
  id: number;
  tenant_id: number;
  tenant_name: string;
  tenant_slug: string;
  name: string;
  description: string | null;
  status: ConnectorStatus;
  version: string | null;
  wireguard_ip: string | null;
  wireguard_public_key: string | null;
  last_heartbeat: string | null;
  pending_jobs: number;
  created_at: string;
  updated_at: string;
};

export type ConnectorDetailView = ConnectorPublicView & {
  wireguard_endpoint: string | null;
  wireguard_allowed_ips: string | null;
  networks: Array<{ id: number; network_cidr: string; description: string | null }>;
  device_count: number;
};

export type ConnectorCreateResponse = ConnectorDetailView & {
  connector_token: string;
  wireguard_config_preview: string;
};

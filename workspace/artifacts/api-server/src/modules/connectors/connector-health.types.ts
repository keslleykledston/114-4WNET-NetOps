export const CONNECTOR_HEALTH_STATUSES = ["HEALTHY", "WARNING", "CRITICAL", "OFFLINE"] as const;
export type ConnectorHealthStatus = (typeof CONNECTOR_HEALTH_STATUSES)[number];

export const CONNECTOR_ALERT_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
export type ConnectorAlertSeverity = (typeof CONNECTOR_ALERT_SEVERITIES)[number];

export const CONNECTOR_ALERT_STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;
export type ConnectorAlertStatus = (typeof CONNECTOR_ALERT_STATUSES)[number];

export const CONNECTOR_ALERT_TYPES = [
  "CONNECTOR_OFFLINE",
  "WIREGUARD_STALE_HANDSHAKE",
  "JOBS_FAILING",
  "JOBS_QUEUE_BACKLOG",
  "HIGH_CPU",
  "HIGH_MEMORY",
  "SSH_COLLECTION_FAILED",
  "SNMP_COLLECTION_FAILED",
  "CONFIG_PARSE_FAILED",
  "BGP_PARSE_FAILED",
  "L2_PARSE_FAILED",
  "CONFIG_DRIFT_DETECTED",
  "CRITICAL_COMPLIANCE_FAILURE",
] as const;
export type ConnectorAlertType = (typeof CONNECTOR_ALERT_TYPES)[number];

export type ConnectorHealthSignals = {
  lastHeartbeatAgeSeconds: number | null;
  lastHandshakeAgeSeconds: number | null;
  wireguardStatus: string | null;
  jobsFailedLastHour: number;
  jobsPending: number;
  oldestPendingJobAgeSeconds: number | null;
  cpuUsage: number | null;
  memoryUsage: number | null;
};

export type ConnectorHealthResult = {
  status: ConnectorHealthStatus;
  score: number;
  reasons: string[];
  lastHeartbeatAgeSeconds: number | null;
  lastHandshakeAgeSeconds: number | null;
  jobsFailedLastHour: number;
  jobsPending: number;
  cpuUsage: number | null;
  memoryUsage: number | null;
};

export type ConnectorHealthSummary = {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  offline: number;
  openAlerts: number;
  jobsPending: number;
  jobsFailedLastHour: number;
};

export type ConnectorMetricsResponse = {
  connector_total: number;
  connector_online_total: number;
  connector_offline_total: number;
  connector_alerts_open_total: number;
  connector_jobs_pending_total: number;
  connector_jobs_failed_1h_total: number;
  connectors: Array<{
    connector_id: number;
    connector_name: string;
    connector_heartbeat_age_seconds: number | null;
    connector_health_score: number;
    connector_health_status: ConnectorHealthStatus;
    connector_wireguard_handshake_age_seconds: number | null;
    connector_jobs_pending: number;
    connector_jobs_failed_1h: number;
    connector_alerts_open: number;
  }>;
};

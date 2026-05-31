async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}

export type ConnectorListItem = {
  id: number;
  tenant_id: number;
  tenant_name: string;
  tenant_slug: string;
  name: string;
  description: string | null;
  status: string;
  version: string | null;
  wireguard_ip: string | null;
  wireguard_public_key: string | null;
  last_heartbeat: string | null;
  pending_jobs: number;
  created_at: string;
  updated_at: string;
};

export type ConnectorDetail = ConnectorListItem & {
  wireguard_endpoint: string | null;
  wireguard_allowed_ips: string | null;
  networks: Array<{ id: number; network_cidr: string; description: string | null }>;
  device_count: number;
};

export type ConnectorCreateResult = ConnectorDetail & {
  wireguard_config_preview: string;
  bootstrap_pending: boolean;
  reprovisioned?: boolean;
};

export type Tenant = {
  id: number;
  name: string;
  slug: string;
  status: string;
};

export type ConnectorGroupStrategy = "ACTIVE_PASSIVE" | "ROUND_ROBIN" | "PRIORITY";

export type ConnectorGroupListItem = {
  id: number;
  tenant_id: number;
  tenant_name: string;
  name: string;
  strategy: ConnectorGroupStrategy;
  member_count: number;
  active_member_count: number;
  created_at: string;
  updated_at: string;
};

export type ConnectorGroupMember = {
  connector_id: number;
  connector_name: string;
  connector_status: string;
  connector_tenant_id: number;
  priority: number;
  weight: number;
};

export type ConnectorGroupDetail = ConnectorGroupListItem & {
  members: ConnectorGroupMember[];
};

export function listConnectors() {
  return apiFetch<ConnectorListItem[]>("/api/connectors");
}

export function getConnector(id: number) {
  return apiFetch<ConnectorDetail>(`/api/connectors/${id}`);
}

export function listTenants() {
  return apiFetch<Tenant[]>("/api/connectors/tenants");
}

export function createTenant(input: { name: string; slug?: string }) {
  return apiFetch<Tenant>("/api/connectors/tenants", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listConnectorGroups() {
  return apiFetch<ConnectorGroupListItem[]>("/api/connectors/groups");
}

export function getConnectorGroup(id: number) {
  return apiFetch<ConnectorGroupDetail>(`/api/connectors/groups/${id}`);
}

export function createConnectorGroup(input: { tenant_id: number; name: string; strategy: ConnectorGroupStrategy }) {
  return apiFetch<ConnectorGroupDetail>("/api/connectors/groups", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateConnectorGroup(
  id: number,
  input: { name?: string; strategy?: ConnectorGroupStrategy },
) {
  return apiFetch<ConnectorGroupDetail>(`/api/connectors/groups/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteConnectorGroup(id: number) {
  return apiFetch<void>(`/api/connectors/groups/${id}`, { method: "DELETE" });
}

export function upsertConnectorGroupMember(
  groupId: number,
  connectorId: number,
  input: { priority?: number; weight?: number },
) {
  return apiFetch<ConnectorGroupMember[]>(`/api/connectors/groups/${groupId}/members/${connectorId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function removeConnectorGroupMember(groupId: number, connectorId: number) {
  return apiFetch<ConnectorGroupMember[]>(`/api/connectors/groups/${groupId}/members/${connectorId}`, {
    method: "DELETE",
  });
}

export function createConnector(input: {
  tenant_id: number;
  name: string;
  description?: string;
  wireguard_ip?: string;
  networks?: Array<{ network_cidr: string; description?: string }>;
}) {
  return apiFetch<ConnectorCreateResult>("/api/connectors", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function downloadBootstrapPackage(connectorId: number, connectorName: string): Promise<void> {
  return fetch(`/api/connectors/${connectorId}/bootstrap-package`, {
    method: "POST",
    credentials: "include",
  })
    .then((res) => {
      if (!res.ok) {
        return res.json().then((data) => {
          throw new Error(data?.error ?? `Bootstrap failed (${res.status})`);
        });
      }
      return res.text();
    })
    .then((content) => {
      const blob = new Blob([content], { type: "text/plain; charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${connectorName}.env`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
}

export function revokeConnector(id: number) {
  return apiFetch<ConnectorDetail>(`/api/connectors/${id}/revoke`, { method: "POST" });
}

export async function deleteConnector(id: number): Promise<void> {
  const response = await fetch(`/api/connectors/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
}

export function getWireGuardConfig(id: number) {
  return apiFetch<{ config: string; wireguard_ip: string | null }>(`/api/connectors/${id}/wireguard/config`);
}

export function listConnectorJobs(id: number) {
  return apiFetch<Array<Record<string, unknown>>>(`/api/connectors/${id}/jobs`);
}

export function getConnectorJob(connectorId: number, jobId: number) {
  return apiFetch<Record<string, unknown>>(`/api/connectors/${connectorId}/jobs/${jobId}`);
}

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

export type ConnectorHealth = {
  connector_id?: number;
  status: string;
  score: number;
  reasons: string[];
  lastHeartbeatAgeSeconds: number | null;
  lastHandshakeAgeSeconds: number | null;
  jobsFailedLastHour: number;
  jobsPending: number;
  cpuUsage: number | null;
  memoryUsage: number | null;
  open_alerts?: number;
};

export type ConnectorAlert = {
  id: number;
  connector_id: number;
  tenant_id: number;
  device_id: number | null;
  severity: string;
  alert_type: string;
  status: string;
  title: string;
  message: string;
  details_json: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConnectorMetrics = {
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
    connector_health_status: string;
    connector_wireguard_handshake_age_seconds: number | null;
    connector_jobs_pending: number;
    connector_jobs_failed_1h: number;
    connector_alerts_open: number;
  }>;
};

export function getConnectorHealthSummary() {
  return apiFetch<ConnectorHealthSummary>("/api/connectors/health/summary");
}

export function getConnectorHealth(id: number) {
  return apiFetch<ConnectorHealth>(`/api/connectors/${id}/health`);
}

export function listConnectorAlerts(params?: { connector_id?: number; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.connector_id) qs.set("connector_id", String(params.connector_id));
  if (params?.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<ConnectorAlert[]>(`/api/connector-alerts${suffix}`);
}

export function listConnectorAlertsForConnector(id: number) {
  return apiFetch<ConnectorAlert[]>(`/api/connectors/${id}/alerts`);
}

export function acknowledgeConnectorAlert(alertId: number) {
  return apiFetch<{ id: number; status: string }>(`/api/connector-alerts/${alertId}/ack`, { method: "POST" });
}

export function resolveConnectorAlert(alertId: number) {
  return apiFetch<{ id: number; status: string }>(`/api/connector-alerts/${alertId}/resolve`, { method: "POST" });
}

export function getConnectorMetrics() {
  return apiFetch<ConnectorMetrics>("/api/connectors/metrics");
}

export function createDiagnosticJob(
  id: number,
  kind: "ping" | "traceroute" | "tcp-check" | "snmpwalk" | "ssh-command",
  body: Record<string, unknown>,
) {
  return apiFetch<Record<string, unknown>>(`/api/connectors/${id}/diagnostics/${kind}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

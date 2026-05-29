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
  connector_token: string;
  wireguard_config_preview: string;
};

export type Tenant = {
  id: number;
  name: string;
  slug: string;
  status: string;
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

export function revokeConnector(id: number) {
  return apiFetch<ConnectorDetail>(`/api/connectors/${id}/revoke`, { method: "POST" });
}

export function getWireGuardConfig(id: number) {
  return apiFetch<{ config: string; wireguard_ip: string | null }>(`/api/connectors/${id}/wireguard/config`);
}

export function listConnectorJobs(id: number) {
  return apiFetch<Array<Record<string, unknown>>>(`/api/connectors/${id}/jobs`);
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

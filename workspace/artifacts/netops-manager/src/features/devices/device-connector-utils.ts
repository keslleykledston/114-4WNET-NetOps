import type { ConnectorListItem } from "@/features/connectors/connectors-api";

const INACTIVE_CONNECTOR_STATUSES = new Set(["REVOKED", "DISABLED"]);

export function pickConnectorForTenant(
  tenantId: number,
  connectors: ConnectorListItem[],
): ConnectorListItem | null {
  const candidates = connectors.filter(
    (c) => c.tenant_id === tenantId && !INACTIVE_CONNECTOR_STATUSES.has(c.status),
  );
  if (candidates.length === 0) return null;

  const online = candidates.filter((c) => c.status === "ONLINE");
  const pool = online.length > 0 ? online : candidates;
  return [...pool].sort((a, b) => a.name.localeCompare(b.name))[0] ?? null;
}

export function getTenantIdForConnector(
  connectorId: number | null | undefined,
  connectors: ConnectorListItem[],
): number | null {
  if (!connectorId) return null;
  return connectors.find((c) => c.id === connectorId)?.tenant_id ?? null;
}

export function connectorsForTenant(tenantId: number, connectors: ConnectorListItem[]): ConnectorListItem[] {
  return connectors.filter(
    (c) => c.tenant_id === tenantId && !INACTIVE_CONNECTOR_STATUSES.has(c.status),
  );
}

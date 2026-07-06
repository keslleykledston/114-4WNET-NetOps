import type { ConnectorGroupListItem, ConnectorListItem } from "@/features/connectors/connectors-api";

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

export function pickConnectorGroupForTenant(
  tenantId: number,
  groups: ConnectorGroupListItem[],
): ConnectorGroupListItem | null {
  const candidates = groups.filter((group) => group.tenant_id === tenantId);
  if (candidates.length === 0) return null;
  const active = candidates.filter((group) => group.active_member_count > 0);
  const pool = active.length > 0 ? active : candidates;
  return [...pool].sort((a, b) => a.name.localeCompare(b.name))[0] ?? null;
}

export function groupsForTenant(tenantId: number, groups: ConnectorGroupListItem[]): ConnectorGroupListItem[] {
  return groups.filter((group) => group.tenant_id === tenantId);
}

export function getTenantIdForConnectorGroup(
  connectorGroupId: number | null | undefined,
  groups: ConnectorGroupListItem[],
): number | null {
  if (!connectorGroupId) return null;
  return groups.find((group) => group.id === connectorGroupId)?.tenant_id ?? null;
}

/** Maps tenant/connector group form fields to API PATCH/POST body fields. */
export function buildDeviceAccessPayload(values: {
  tenantId: string;
  connectorGroupId: string;
}): { connectorGroupId: number | null; connectorId: null } {
  if (values.connectorGroupId) {
    return {
      connectorGroupId: Number(values.connectorGroupId),
      connectorId: null,
    };
  }
  return {
    connectorGroupId: null,
    connectorId: null,
  };
}

export function appendSnmpToDevicePayload(
  payload: { snmpCommunity?: string },
  snmpCommunity: string,
  mode: "create" | "edit",
): void {
  const trimmed = snmpCommunity.trim();
  if (mode === "create") {
    if (trimmed) payload.snmpCommunity = trimmed;
    return;
  }
  if (trimmed) payload.snmpCommunity = trimmed;
}

import {
  connectorGroupsTable,
  connectorsTable,
  db,
  deviceGroupsTable,
  devicesTable,
  tenantsTable,
  type Device,
} from "@workspace/db";
import { eq } from "drizzle-orm";

export type CopilotCompanyKind = "tenant" | "device_group" | "site";

export interface CopilotCompanyScope {
  kind: CopilotCompanyKind;
  key: string;
  label: string;
  tenantId: number | null;
  deviceGroupId: number | null;
  site: string | null;
  deviceIds: number[];
  deviceHostnames: string[];
}

export interface ScopedDevice extends Device {
  tenantId: number | null;
  tenantName: string | null;
  deviceGroupName: string | null;
}

async function loadScopedDevices(): Promise<ScopedDevice[]> {
  const rows = await db
    .select({
      device: devicesTable,
      tenantIdFromGroup: connectorGroupsTable.tenantId,
      tenantIdFromConnector: connectorsTable.tenantId,
      tenantName: tenantsTable.name,
      deviceGroupName: deviceGroupsTable.name,
    })
    .from(devicesTable)
    .leftJoin(connectorGroupsTable, eq(devicesTable.connectorGroupId, connectorGroupsTable.id))
    .leftJoin(connectorsTable, eq(devicesTable.connectorId, connectorsTable.id))
    .leftJoin(
      tenantsTable,
      eq(tenantsTable.id, connectorGroupsTable.tenantId),
    )
    .leftJoin(deviceGroupsTable, eq(devicesTable.groupId, deviceGroupsTable.id));

  return rows.map((row) => ({
    ...row.device,
    tenantId: row.tenantIdFromGroup ?? row.tenantIdFromConnector ?? null,
    tenantName: row.tenantName ?? null,
    deviceGroupName: row.deviceGroupName ?? null,
  }));
}

function companyKeyForDevice(device: ScopedDevice): { kind: CopilotCompanyKind; key: string; label: string } {
  if (device.tenantId != null) {
    return {
      kind: "tenant",
      key: `tenant:${device.tenantId}`,
      label: device.tenantName ?? `Tenant ${device.tenantId}`,
    };
  }
  if (device.groupId != null) {
    return {
      kind: "device_group",
      key: `group:${device.groupId}`,
      label: device.deviceGroupName ?? `Grupo ${device.groupId}`,
    };
  }
  if (device.site?.trim()) {
    return {
      kind: "site",
      key: `site:${device.site.trim().toUpperCase()}`,
      label: device.site.trim(),
    };
  }
  return { kind: "site", key: "site:UNKNOWN", label: "Sem empresa vinculada" };
}

function buildScope(kind: CopilotCompanyKind, key: string, label: string, devices: ScopedDevice[]): CopilotCompanyScope {
  const anchor = devices[0];
  return {
    kind,
    key,
    label,
    tenantId: anchor?.tenantId ?? null,
    deviceGroupId: anchor?.groupId ?? null,
    site: anchor?.site ?? null,
    deviceIds: devices.map((device) => device.id),
    deviceHostnames: devices.map((device) => device.hostname),
  };
}

/** Devices in the same company (tenant > device_group > site). Never crosses tenants. */
export async function resolveCopilotCompanyScope(input: {
  deviceId?: number;
  siteFilter?: string;
}): Promise<CopilotCompanyScope> {
  const all = (await loadScopedDevices()).filter((device) => device.status === "active");

  if (all.length === 0) {
    return {
      kind: "site",
      key: "empty",
      label: "Nenhum device ativo",
      tenantId: null,
      deviceGroupId: null,
      site: null,
      deviceIds: [],
      deviceHostnames: [],
    };
  }

  let anchor = input.deviceId
    ? all.find((device) => device.id === input.deviceId) ?? null
    : null;

  if (!anchor && input.siteFilter) {
    const site = input.siteFilter.trim().toUpperCase();
    anchor = all.find((device) => device.site?.trim().toUpperCase() === site) ?? null;
  }

  if (!anchor) {
    const byCompany = new Map<string, ScopedDevice[]>();
    for (const device of all) {
      const company = companyKeyForDevice(device);
      const bucket = byCompany.get(company.key) ?? [];
      bucket.push(device);
      byCompany.set(company.key, bucket);
    }
    const largest = [...byCompany.entries()].sort((left, right) => right[1].length - left[1].length)[0];
    const [key, devices] = largest ?? ["site:UNKNOWN", all];
    const company = companyKeyForDevice(devices[0]!);
    return buildScope(company.kind, key, company.label, devices);
  }

  const company = companyKeyForDevice(anchor);
  let scoped = all.filter((device) => companyKeyForDevice(device).key === company.key);

  if (input.siteFilter) {
    const site = input.siteFilter.trim().toUpperCase();
    scoped = scoped.filter((device) => device.site?.trim().toUpperCase() === site);
  }

  return buildScope(company.kind, company.key, company.label, scoped.length > 0 ? scoped : [anchor]);
}

export async function loadDevicesInScope(scope: CopilotCompanyScope): Promise<ScopedDevice[]> {
  if (scope.deviceIds.length === 0) return [];
  const all = await loadScopedDevices();
  const allowed = new Set(scope.deviceIds);
  return all.filter((device) => allowed.has(device.id));
}

export async function listCompanyScopes(): Promise<CopilotCompanyScope[]> {
  const all = (await loadScopedDevices()).filter((device) => device.status === "active");
  const grouped = new Map<string, ScopedDevice[]>();

  for (const device of all) {
    const company = companyKeyForDevice(device);
    const bucket = grouped.get(company.key) ?? [];
    bucket.push(device);
    grouped.set(company.key, bucket);
  }

  return [...grouped.entries()].map(([key, devices]) => {
    const company = companyKeyForDevice(devices[0]!);
    return buildScope(company.kind, key, company.label, devices);
  });
}

export function scopeAllowsDevice(scope: CopilotCompanyScope, deviceId: number): boolean {
  return scope.deviceIds.includes(deviceId);
}

export async function assertDevicesShareCompany(deviceIds: number[]): Promise<boolean> {
  if (deviceIds.length <= 1) return true;
  const scopes = await listCompanyScopes();
  return scopes.some((scope) => deviceIds.every((id) => scope.deviceIds.includes(id)));
}

import { db, devicesTable, integrationSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { env } from "../../lib/env.js";
import { logAuditEvent } from "../../lib/audit.js";
import { netboxFetch, netboxPaginate, NetBoxError } from "./netbox.client.js";
import {
  buildPlaceholderCredentials,
  classifyNetBoxDeviceAction,
  mapNetBoxDeviceToLocalFields,
  normalizeId,
  normalizeNetBoxDevice,
  normalizeText,
  stripIpMask,
} from "./netbox.mapper.js";
import type {
  NetBoxConfig,
  NetBoxConnectionTestResponse,
  NetBoxDevice,
  NetBoxListResponse,
  NetBoxSimpleItem,
  NetBoxStatusResponse,
  NetBoxSyncPreviewRequest,
  NetBoxSyncPreviewResponse,
  NetBoxSyncResult,
} from "./netbox.types.js";

const INTEGRATION_NAME = "netbox";
type IntegrationRow = Awaited<ReturnType<typeof ensureIntegrationRow>>;
type LocalDeviceRef = {
  id: number;
  hostname: string;
  ipAddress: string;
  vendor: string;
  platform: string;
  site: string;
  role: string | null;
  netboxDeviceId: number | null;
};

async function ensureIntegrationRow() {
  const [existing] = await db.select().from(integrationSettingsTable).where(eq(integrationSettingsTable.name, INTEGRATION_NAME));
  if (existing) return existing;
  const [created] = await db.insert(integrationSettingsTable).values({
    name: INTEGRATION_NAME,
    enabled: false,
    readiness: "future",
    lastConnectionStatus: null,
    lastConnectionAt: null,
    configJson: {
      readiness: "future",
      baseUrl: null,
      skipTlsVerify: false,
      tokenConfigured: false,
      notes: "Integração preparada para fase futura",
    },
  }).returning();
  return created;
}

function extractConfigJson(row: IntegrationRow | null) {
  return row?.configJson && typeof row.configJson === "object" && !Array.isArray(row.configJson)
    ? row.configJson as Record<string, unknown>
    : {};
}

function resolveBaseUrl(row: IntegrationRow | null) {
  const fromDb = normalizeText(extractConfigJson(row).baseUrl);
  return env.netboxUrl ?? fromDb;
}

function resolveSkipTlsVerify(row: IntegrationRow | null) {
  if (env.netboxSkipTlsVerify) return true;
  const value = extractConfigJson(row).skipTlsVerify;
  return typeof value === "boolean" ? value : false;
}

function toStatus(row: IntegrationRow | null): NetBoxStatusResponse {
  const baseUrl = resolveBaseUrl(row);
  const tokenConfigured = Boolean(env.netboxToken);
  const enabled = Boolean(env.netboxEnabled || row?.enabled);
  const baseUrlConfigured = Boolean(baseUrl);
  const readiness: NetBoxConfig["readiness"] = !enabled
    ? "disabled"
    : baseUrlConfigured && tokenConfigured
      ? "ready"
      : "partial";

  return {
    enabled,
    baseUrl,
    tokenConfigured,
    skipTlsVerify: resolveSkipTlsVerify(row),
    timeoutMs: env.netboxTimeoutMs,
    pageSize: env.netboxPageSize,
    readiness,
    lastConnectionStatus: row?.lastConnectionStatus ?? null,
    lastConnectionAt: row?.lastConnectionAt?.toISOString() ?? null,
    baseUrlConfigured,
  };
}

async function saveConnectionStatus(status: string) {
  await db.update(integrationSettingsTable)
    .set({
      lastConnectionStatus: status,
      lastConnectionAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(integrationSettingsTable.name, INTEGRATION_NAME));
}

async function requestNetBoxJson<T>(path: string, options: RequestInit = {}, row: IntegrationRow | null = null): Promise<T> {
  const status = toStatus(row);
  if (!status.enabled) throw new NetBoxError("NetBox disabled. Enable NETBOX_ENABLED to use this integration.", 503);
  if (!status.baseUrlConfigured) throw new NetBoxError("NetBox base URL not configured.", 400);
  if (!status.tokenConfigured) throw new NetBoxError("NetBox token not configured.", 400);

  const { data } = await netboxFetch<T>(status.baseUrl as string, env.netboxToken as string, path, {
    ...options,
    timeoutMs: status.timeoutMs,
    skipTlsVerify: status.skipTlsVerify,
  });
  return data;
}

async function paginate<T>(path: string, params: Record<string, string | number | boolean | undefined | null> = {}, row: IntegrationRow | null = null) {
  const currentRow = row ?? await ensureIntegrationRow();
  const status = toStatus(currentRow);
  if (!status.enabled) throw new NetBoxError("NetBox disabled. Enable NETBOX_ENABLED to use this integration.", 503);
  if (!status.baseUrlConfigured) throw new NetBoxError("NetBox base URL not configured.", 400);
  if (!status.tokenConfigured) throw new NetBoxError("NetBox token not configured.", 400);

  return netboxPaginate<T>(status.baseUrl as string, env.netboxToken as string, path, params, {
    timeoutMs: status.timeoutMs,
    skipTlsVerify: status.skipTlsVerify,
  });
}

function toSimpleItem(item: Record<string, unknown>): NetBoxSimpleItem {
  return {
    id: normalizeId(item.id) ?? 0,
    name: normalizeText(item.name) ?? "",
    slug: normalizeText(item.slug),
    displayName: normalizeText(item.display_name) ?? normalizeText(item.name) ?? "",
  };
}

function toDevice(item: Record<string, unknown>): NetBoxDevice {
  return normalizeNetBoxDevice(item);
}

async function fetchAllDevices(row: IntegrationRow | null = null): Promise<NetBoxDevice[]> {
  const currentRow = row ?? await ensureIntegrationRow();
  const devices: NetBoxDevice[] = [];
  let offset = 0;
  const limit = env.netboxPageSize;
  while (true) {
    const page = await paginate<Record<string, unknown>>("/api/dcim/devices/", { limit, offset }, currentRow);
    devices.push(...page.items.map((item) => toDevice(item)));
    if (!page.next) break;
    offset += limit;
  }
  return devices;
}

async function fetchAllSimple(path: string, row: IntegrationRow | null = null): Promise<NetBoxSimpleItem[]> {
  const currentRow = row ?? await ensureIntegrationRow();
  const items: NetBoxSimpleItem[] = [];
  let offset = 0;
  const limit = env.netboxPageSize;
  while (true) {
    const page = await paginate<Record<string, unknown>>(path, { limit, offset }, currentRow);
    items.push(...page.items.map((item) => toSimpleItem(item)));
    if (!page.next) break;
    offset += limit;
  }
  return items;
}

function buildLocalIndex(devices: LocalDeviceRef[]) {
  const byNetBoxId = new Map<number, LocalDeviceRef>();
  const byHostname = new Map<string, LocalDeviceRef>();
  for (const device of devices) {
    if (typeof device.netboxDeviceId === "number") byNetBoxId.set(device.netboxDeviceId, device);
    byHostname.set(device.hostname.trim().toLowerCase(), device);
  }
  return { byNetBoxId, byHostname };
}

function buildPreviewItems(remoteDevices: NetBoxDevice[], localDevices: LocalDeviceRef[]) {
  const index = buildLocalIndex(localDevices);
  const items = remoteDevices.map((device) => {
    const byId = index.byNetBoxId.get(device.id) ?? null;
    const byHostname = index.byHostname.get(device.name.trim().toLowerCase()) ?? null;
    const local = byId ?? byHostname;
    const classified = classifyNetBoxDeviceAction(device, local);
    const warnings = [...classified.warnings];
    if (byId) warnings.push("Matched by netbox_device_id.");
    else if (byHostname) warnings.push("Matched by hostname.");
    return {
      netboxDeviceId: device.id,
      hostname: device.name,
      ipAddress: device.ipAddress,
      site: device.siteName,
      role: device.roleName,
      vendor: device.vendor,
      platform: device.platform,
      action: classified.action,
      matchedLocalDeviceId: classified.matchedLocalDeviceId,
      warnings,
    };
  });

  const summary = {
    totalFromNetBox: items.length,
    matchedByNetboxId: items.filter((item) => item.matchedLocalDeviceId !== null && localDevices.some((local) => local.netboxDeviceId === item.netboxDeviceId)).length,
    matchedByHostname: items.filter((item) => item.matchedLocalDeviceId !== null && !localDevices.some((local) => local.netboxDeviceId === item.netboxDeviceId)).length,
    toCreate: items.filter((item) => item.action === "create").length,
    toUpdate: items.filter((item) => item.action === "update").length,
    toSkip: items.filter((item) => item.action === "skip").length,
    warnings: items.reduce((count, item) => count + item.warnings.length, 0),
  };

  return { summary, items };
}

export async function getNetBoxStatus(): Promise<NetBoxStatusResponse> {
  const row = await ensureIntegrationRow();
  return toStatus(row);
}

export async function testConnection(): Promise<NetBoxConnectionTestResponse> {
  const row = await ensureIntegrationRow();
  const status = toStatus(row);
  const testedAt = new Date().toISOString();

  if (!status.enabled) {
    await saveConnectionStatus("disabled");
    return {
      status: "disabled",
      message: "NetBox disabled. Enable NETBOX_ENABLED to test connection.",
      readiness: "disabled",
      baseUrlConfigured: status.baseUrlConfigured,
      tokenConfigured: status.tokenConfigured,
      skipTlsVerify: status.skipTlsVerify,
      testedAt,
    };
  }

  if (!status.baseUrlConfigured || !status.tokenConfigured) {
    await saveConnectionStatus("missing_config");
    return {
      status: "missing_config",
      message: !status.baseUrlConfigured ? "NetBox base URL not configured." : "NetBox token not configured.",
      readiness: status.readiness,
      baseUrlConfigured: status.baseUrlConfigured,
      tokenConfigured: status.tokenConfigured,
      skipTlsVerify: status.skipTlsVerify,
      testedAt,
    };
  }

  try {
    const data = await requestNetBoxJson<{ version?: string }>("/api/status/", {}, row);
    await saveConnectionStatus("ok");
    return {
      status: "ok",
      message: "NetBox connection ok.",
      readiness: "ready",
      baseUrlConfigured: true,
      tokenConfigured: true,
      skipTlsVerify: status.skipTlsVerify,
      testedAt,
      version: data.version ?? null,
    };
  } catch (error) {
    await saveConnectionStatus("error");
    return {
      status: "error",
      message: error instanceof NetBoxError ? error.message : "NetBox connection failed.",
      readiness: status.readiness,
      baseUrlConfigured: status.baseUrlConfigured,
      tokenConfigured: status.tokenConfigured,
      skipTlsVerify: status.skipTlsVerify,
      testedAt,
    };
  }
}

export async function listDevices(): Promise<NetBoxListResponse<NetBoxDevice>> {
  const row = await ensureIntegrationRow();
  const page = await paginate<Record<string, unknown>>("/api/dcim/devices/", { limit: env.netboxPageSize, offset: 0 }, row);
  return {
    count: page.count,
    next: page.next,
    previous: page.previous,
    items: page.items.map((item) => toDevice(item)),
  };
}

export async function listSimple(path: string): Promise<NetBoxListResponse<NetBoxSimpleItem>> {
  const row = await ensureIntegrationRow();
  const page = await paginate<Record<string, unknown>>(path, { limit: env.netboxPageSize, offset: 0 }, row);
  return {
    count: page.count,
    next: page.next,
    previous: page.previous,
    items: page.items.map((item) => toSimpleItem(item)),
  };
}

export async function previewDeviceSync(_: NetBoxSyncPreviewRequest = {}): Promise<NetBoxSyncPreviewResponse> {
  const row = await ensureIntegrationRow();
  const remoteDevices = await fetchAllDevices(row);
  const localDevices = await db.select({
    id: devicesTable.id,
    hostname: devicesTable.hostname,
    ipAddress: devicesTable.ipAddress,
    vendor: devicesTable.vendor,
    platform: devicesTable.platform,
    site: devicesTable.site,
    role: devicesTable.role,
    netboxDeviceId: devicesTable.netboxDeviceId,
  }).from(devicesTable);

  const preview = buildPreviewItems(remoteDevices, localDevices);

  await logAuditEvent({
    action: "netbox_preview_sync",
    objectType: "integration",
    objectId: INTEGRATION_NAME,
    metadata: preview.summary,
  });

  return preview;
}

export async function syncDevicesReadOnly(): Promise<NetBoxSyncResult> {
  const startedAt = Date.now();
  const row = await ensureIntegrationRow();
  const remoteDevices = await fetchAllDevices(row);
  const localDevices = await db.select({
    id: devicesTable.id,
    hostname: devicesTable.hostname,
    ipAddress: devicesTable.ipAddress,
    vendor: devicesTable.vendor,
    platform: devicesTable.platform,
    site: devicesTable.site,
    role: devicesTable.role,
    netboxDeviceId: devicesTable.netboxDeviceId,
  }).from(devicesTable);
  const index = buildLocalIndex(localDevices);
  const preview = buildPreviewItems(remoteDevices, localDevices);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const warningsList: string[] = [];
  const placeholder = buildPlaceholderCredentials();

  try {
    for (const remote of remoteDevices) {
      const byId = index.byNetBoxId.get(remote.id) ?? null;
      const byHostname = index.byHostname.get(remote.name.trim().toLowerCase()) ?? null;
      const local = byId ?? byHostname;

      if (!remote.ipAddress) {
        skipped++;
        warningsList.push(`NetBox device ${remote.name} has no primary IP.`);
        continue;
      }

      const mapped = mapNetBoxDeviceToLocalFields(remote);
      const targetIp = stripIpMask(mapped.ipAddress) ?? remote.ipAddress;

      if (!local) {
        await db.insert(devicesTable).values({
          hostname: mapped.hostname,
          ipAddress: targetIp ?? remote.name,
          vendor: mapped.vendor ?? "netbox",
          platform: mapped.platform ?? "netbox",
          sshPort: 22,
          username: placeholder.username,
          passwordEncrypted: placeholder.passwordEncrypted,
          site: mapped.site ?? "unknown",
          role: mapped.role,
          netboxDeviceId: mapped.netboxDeviceId,
          status: "unknown",
          snmpCommunity: null,
        });
        created++;
        continue;
      }

      await db.update(devicesTable).set({
        hostname: mapped.hostname,
        ipAddress: targetIp ?? local.ipAddress,
        vendor: mapped.vendor ?? local.vendor,
        platform: mapped.platform ?? local.platform,
        site: mapped.site ?? local.site,
        role: mapped.role ?? local.role,
        netboxDeviceId: mapped.netboxDeviceId,
        updatedAt: new Date(),
      }).where(eq(devicesTable.id, local.id));
      updated++;
    }

    const result: NetBoxSyncResult = {
      ...preview,
      durationMs: Date.now() - startedAt,
      created,
      updated,
      skipped,
      warningsList,
    };

    await logAuditEvent({
      action: "netbox_sync_completed",
      objectType: "integration",
      objectId: INTEGRATION_NAME,
      metadata: {
        created,
        updated,
        skipped,
        warnings: warningsList.length,
        durationMs: result.durationMs,
      },
    });

    return result;
  } catch (error) {
    await logAuditEvent({
      action: "netbox_sync_failed",
      objectType: "integration",
      objectId: INTEGRATION_NAME,
      metadata: {
        error: error instanceof Error ? error.message : "NetBox sync failed",
      },
    });
    throw error;
  }
}

export async function logNetBoxTestConnection(sourceIp: string) {
  const result = await testConnection();
  await logAuditEvent({
    action: "netbox_test_connection",
    objectType: "integration",
    objectId: INTEGRATION_NAME,
    metadata: {
      status: result.status,
      message: result.message,
      readiness: result.readiness,
      baseUrlConfigured: result.baseUrlConfigured,
      tokenConfigured: result.tokenConfigured,
      skipTlsVerify: result.skipTlsVerify,
      version: result.version ?? null,
    },
    sourceIp,
  });
  return result;
}

export async function logNetBoxSyncStarted(sourceIp: string) {
  await logAuditEvent({
    action: "netbox_sync_started",
    objectType: "integration",
    objectId: INTEGRATION_NAME,
    metadata: {
      enabled: env.netboxEnabled,
      tokenConfigured: Boolean(env.netboxToken),
    },
    sourceIp,
  });
}

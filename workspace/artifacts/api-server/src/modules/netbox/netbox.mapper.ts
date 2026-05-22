import { encrypt } from "../../lib/crypto.js";
import type { Device } from "@workspace/db";
import type { NetBoxDevice, NetBoxSimpleItem, NetBoxSyncPreviewItem } from "./netbox.types.js";

function normalizeText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return normalizeText(obj.value ?? obj.label ?? obj.name ?? obj.slug);
  }
  return null;
}

function normalizeId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return normalizeId(obj.id ?? obj.value);
  }
  return null;
}

export function stripIpMask(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.split("/")[0]?.trim() || null;
}

export function normalizeNetBoxDevice(raw: Record<string, unknown>): NetBoxDevice {
  const primaryIp = raw.primary_ip4 ?? raw.primary_ip ?? null;
  const deviceType = raw.device_type && typeof raw.device_type === "object" ? raw.device_type as Record<string, unknown> : {};
  const manufacturer = deviceType.manufacturer && typeof deviceType.manufacturer === "object"
    ? deviceType.manufacturer as Record<string, unknown>
    : {};

  return {
    id: normalizeId(raw.id) ?? 0,
    name: normalizeText(raw.name) ?? `netbox-${normalizeId(raw.id) ?? "device"}`,
    displayName: normalizeText(raw.display_name) ?? normalizeText(raw.name) ?? `netbox-${normalizeId(raw.id) ?? "device"}`,
    ipAddress: stripIpMask(normalizeText(primaryIp && typeof primaryIp === "object" ? (primaryIp as Record<string, unknown>).address : primaryIp)),
    siteId: normalizeId(raw.site && typeof raw.site === "object" ? (raw.site as Record<string, unknown>).id : null),
    siteName: normalizeText(raw.site && typeof raw.site === "object" ? (raw.site as Record<string, unknown>).name : raw.site),
    tenantId: normalizeId(raw.tenant && typeof raw.tenant === "object" ? (raw.tenant as Record<string, unknown>).id : null),
    tenantName: normalizeText(raw.tenant && typeof raw.tenant === "object" ? (raw.tenant as Record<string, unknown>).name : raw.tenant),
    roleId: normalizeId(raw.device_role && typeof raw.device_role === "object" ? (raw.device_role as Record<string, unknown>).id : raw.role),
    roleName: normalizeText(raw.device_role && typeof raw.device_role === "object" ? (raw.device_role as Record<string, unknown>).name : raw.role),
    vendor: normalizeText(manufacturer.name ?? manufacturer.slug),
    platform: normalizeText(raw.platform && typeof raw.platform === "object" ? (raw.platform as Record<string, unknown>).name : raw.platform),
    status: normalizeText(raw.status),
    description: normalizeText(raw.description),
    comments: normalizeText(raw.comments),
  };
}

export function mapNetBoxDeviceToLocalFields(device: NetBoxDevice) {
  return {
    hostname: device.name,
    ipAddress: device.ipAddress,
    vendor: device.vendor ?? "netbox",
    platform: device.platform ?? "netbox",
    site: device.siteName ?? "unknown",
    role: device.roleName ?? null,
    netboxDeviceId: device.id,
  };
}

export function classifyNetBoxDeviceAction(device: NetBoxDevice, local: Pick<Device, "id" | "hostname" | "ipAddress" | "vendor" | "platform" | "site" | "role" | "netboxDeviceId"> | null): {
  action: "create" | "update" | "skip";
  matchedLocalDeviceId: number | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const matchedLocalDeviceId = local?.id ?? null;

  if (!device.ipAddress) {
    warnings.push("NetBox device has no primary IP.");
    if (!local) return { action: "skip", matchedLocalDeviceId, warnings };
  }

  if (!device.name) warnings.push("NetBox device has no hostname.");
  if (!device.siteName) warnings.push("NetBox device has no site.");

  const nextFields = mapNetBoxDeviceToLocalFields(device);
  if (!local) {
    return { action: device.ipAddress ? "create" : "skip", matchedLocalDeviceId, warnings };
  }

  const hasChanges =
    local.hostname !== nextFields.hostname ||
    (device.ipAddress ? local.ipAddress !== nextFields.ipAddress : false) ||
    local.vendor !== nextFields.vendor ||
    local.platform !== nextFields.platform ||
    local.site !== nextFields.site ||
    (nextFields.role ?? null) !== (local.role ?? null) ||
    local.netboxDeviceId !== device.id;

  return { action: hasChanges ? "update" : "skip", matchedLocalDeviceId, warnings };
}

export function buildPlaceholderCredentials() {
  return {
    username: "",
    passwordEncrypted: encrypt(""),
  };
}

export function summarizePreview(items: NetBoxSyncPreviewItem[]) {
  return {
    totalFromNetBox: items.length,
    matchedByNetboxId: items.filter((item) => item.action !== "create" && item.matchedLocalDeviceId !== null).length,
    matchedByHostname: 0,
    toCreate: items.filter((item) => item.action === "create").length,
    toUpdate: items.filter((item) => item.action === "update").length,
    toSkip: items.filter((item) => item.action === "skip").length,
    warnings: items.reduce((count, item) => count + item.warnings.length, 0),
  };
}

export function isNetBoxDeviceCandidate(raw: Record<string, unknown>) {
  return normalizeId(raw.id) !== null && normalizeText(raw.name) !== null;
}

export { normalizeText, normalizeId };

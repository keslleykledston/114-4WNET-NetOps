import type { Device } from "@workspace/db";
import type { DeviceKind } from "./device-profile-types.js";
import { DEVICE_PROFILE_LIBRARY } from "./device-profile-library.js";

interface DeviceInfo {
  model?: string;
  vendor?: string;
  hostname?: string;
}

export function resolveDeviceKind(deviceInfo: DeviceInfo): DeviceKind {
  const { model, vendor, hostname } = deviceInfo;

  if (!model && !vendor && !hostname) {
    return "unknown";
  }

  // Try by model first
  if (model) {
    const normalizedModel = normalizeString(model);
    for (const [_, profile] of Object.entries(DEVICE_PROFILE_LIBRARY)) {
      for (const m of profile.models) {
        if (normalizeString(m) === normalizedModel) {
          return profile.kind;
        }
      }
    }
  }

  // Try by vendor + model pattern
  if (vendor && model) {
    const pattern = `${normalizeString(vendor)}-${normalizeString(model)}`;
    for (const [key, profile] of Object.entries(DEVICE_PROFILE_LIBRARY)) {
      if (key === pattern) {
        return profile.kind;
      }
    }
  }

  // Try by vendor heuristics
  if (vendor) {
    const vendorLower = vendor.toLowerCase();
    if (vendorLower.includes("huawei")) {
      // Huawei: default to router, unless hostname indicates switch
      if (hostname?.toLowerCase().includes("switch")) return "switch";
      return "router";
    }
    if (vendorLower.includes("cisco")) return "router";
    if (vendorLower.includes("juniper")) return "router";
    if (vendorLower.includes("datacom")) return "switch";
  }

  // Try by hostname patterns (common naming conventions)
  if (hostname) {
    const hostLower = hostname.toLowerCase();
    if (hostLower.includes("router") || hostLower.includes("rtr")) return "router";
    if (hostLower.includes("switch") || hostLower.includes("sw")) return "switch";
  }

  return "unknown";
}

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function deriveDeviceKind(device: Device): DeviceKind {
  return resolveDeviceKind({
    model: device.platform ?? undefined,
    vendor: device.vendor ?? undefined,
    hostname: device.hostname,
  });
}

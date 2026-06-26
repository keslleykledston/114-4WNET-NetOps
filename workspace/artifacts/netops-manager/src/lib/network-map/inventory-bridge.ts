import type { Device, NetopsInterface } from "@workspace/api-client-react";
import type { DeviceData, DeviceType, LinkData, NodeStatus } from "./types";

export const INVENTORY_NODE_PREFIX = "device:";

export function inventoryNodeId(deviceId: number): string {
  return `${INVENTORY_NODE_PREFIX}${deviceId}`;
}

export function parseInventoryNodeId(nodeId: string): number | null {
  if (!nodeId.startsWith(INVENTORY_NODE_PREFIX)) return null;
  const n = Number(nodeId.slice(INVENTORY_NODE_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

function mapInventoryStatus(status: string): NodeStatus {
  const s = status.toLowerCase();
  if (s === "active" || s === "up" || s === "online") return "UP";
  if (s === "unreachable" || s === "down") return "DOWN";
  if (s === "degraded" || s === "partial") return "PARTIAL";
  return "UNKNOWN";
}

function inferDeviceType(device: Device): DeviceType {
  const blob = `${device.vendor} ${device.platform} ${device.role ?? ""}`.toLowerCase();
  if (blob.includes("switch") || blob.includes("s6730")) return "switch";
  if (blob.includes("olt")) return "olt";
  if (blob.includes("firewall")) return "firewall";
  return "router";
}

export function mapInventoryDeviceToMapNode(device: Device, interfaceCount = 0): DeviceData {
  return {
    id: inventoryNodeId(device.id),
    name: device.hostname,
    type: inferDeviceType(device),
    vendor: device.vendor,
    model: device.platform,
    role: device.role ?? "network",
    site: device.site,
    tenant: "4WNET",
    status: mapInventoryStatus(device.status),
    mgmtIp: device.ipAddress,
    interfaces: interfaceCount,
    alarms: 0,
  };
}

const HUAWEI_PHYSICAL_IF_RE =
  /^(?:(?:10|25|40|100|400)GE\d+(?:\/\d+){2}|(?:XGigabit|Gigabit)Ethernet\d+(?:\/\d+){2}|Eth-Trunk\d+)$/i;

export function isLikelyPhysicalInterface(iface: NetopsInterface): boolean {
  if (iface.kind === "physical") return true;
  if (iface.kind && iface.kind !== "other") return false;
  return HUAWEI_PHYSICAL_IF_RE.test(iface.name.trim());
}

export function physicalInterfaces(interfaces: NetopsInterface[] | undefined): NetopsInterface[] {
  if (!interfaces?.length) return [];
  return interfaces.filter(isLikelyPhysicalInterface);
}

export function usedInterfaceNames(
  links: LinkData[],
  deviceNodeId: string,
  side: "source" | "target",
): Set<string> {
  const used = new Set<string>();
  for (const link of links) {
    if (side === "source" && link.source === deviceNodeId && link.intfA && link.intfA !== "—") {
      used.add(link.intfA);
    }
    if (side === "target" && link.target === deviceNodeId && link.intfB && link.intfB !== "—") {
      used.add(link.intfB);
    }
  }
  return used;
}

export function isInterfaceInUse(
  links: LinkData[],
  deviceNodeId: string,
  interfaceName: string,
  side: "source" | "target",
): boolean {
  return usedInterfaceNames(links, deviceNodeId, side).has(interfaceName);
}

import type { DiscoveryConfidence, DiscoverySource } from "./discovery.types.js";

export const DISCOVERY_SOURCE_PRIORITY: DiscoverySource[] = [
  "ssh_live",
  "ssh_running_config",
  "manual_upload",
  "snmp_snapshot",
  "local_db",
  "netbox",
];

export function sourceConfidence(source: DiscoverySource): DiscoveryConfidence {
  if (source === "ssh_live" || source === "ssh_running_config") return "high";
  if (source === "manual_upload" || source === "snmp_snapshot") return "medium";
  return "low";
}

export function betterSource(left: DiscoverySource, right: DiscoverySource): DiscoverySource {
  return DISCOVERY_SOURCE_PRIORITY.indexOf(left) <= DISCOVERY_SOURCE_PRIORITY.indexOf(right) ? left : right;
}

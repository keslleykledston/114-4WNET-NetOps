import type { DeviceDiscoverySnapshot, DiscoveryConfidence, DiscoverySource } from "../netops/device-discovery/discovery.types.js";

export type ComplianceConfidence = DiscoveryConfidence | "unknown";
export type ComplianceSource =
  | "ssh_live"
  | "ssh_running_config"
  | "cached_config"
  | "snmp_snapshot"
  | "discovery_snapshot"
  | "local_db"
  | "netbox_readonly"
  | "unknown";

export function sourceFromSnapshot(snapshot: DeviceDiscoverySnapshot | null): ComplianceSource {
  if (!snapshot) return "unknown";
  if (snapshot.sourcesUsed.includes("ssh_live")) return "ssh_live";
  if (snapshot.sourcesUsed.includes("ssh_running_config")) return "ssh_running_config";
  if (snapshot.sourcesUsed.includes("snmp_snapshot")) return "snmp_snapshot";
  if (snapshot.sourcesUsed.includes("local_db")) return "local_db";
  if (snapshot.sourcesUsed.includes("netbox" as DiscoverySource)) return "netbox_readonly";
  if (snapshot.cachedFromPersistedSnapshot || snapshot.sourceStatus.cachedConfig === "used") return "cached_config";
  return "discovery_snapshot";
}

export function confidenceFromSnapshot(snapshot: DeviceDiscoverySnapshot | null): ComplianceConfidence {
  if (!snapshot) return "unknown";
  if (snapshot.sourcesUsed.includes("ssh_live") || snapshot.sourcesUsed.includes("ssh_running_config")) return "high";
  if (snapshot.sourcesUsed.includes("snmp_snapshot") || snapshot.sourceStatus.cachedConfig === "used") return "medium";
  if (snapshot.sourcesUsed.includes("local_db") || snapshot.cachedFromPersistedSnapshot) return "low";
  return "medium";
}

export function reduceSeverityForWeakEvidence(severity: string, confidence: ComplianceConfidence): string {
  if (confidence === "high" || confidence === "medium") return severity;
  if (severity === "critical" || severity === "high") return "warning";
  return severity;
}

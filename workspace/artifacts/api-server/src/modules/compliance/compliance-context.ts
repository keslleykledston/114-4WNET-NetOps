import type { CollectedConfig, Device, DiscoverySnapshot } from "@workspace/db";
import type { CompliancePolicyProfile } from "@workspace/db/schema";
import type { DeviceDiscoverySnapshot } from "../netops/device-discovery/discovery.types.js";
import type { ComplianceConfidence, ComplianceSource } from "./confidence.js";

export type ComplianceStatus = "pass" | "fail" | "warning" | "unknown";
export type ComplianceSeverity = "critical" | "high" | "medium" | "low" | "info" | "warning";

export type StructuredFinding = {
  policyKey: string;
  policyName: string;
  context: string;
  status: ComplianceStatus;
  severity: ComplianceSeverity;
  message: string;
  evidence?: unknown;
  recommendation?: string;
  blocking?: boolean;
  source: ComplianceSource;
  confidence: ComplianceConfidence;
  objectType?: string;
  objectId?: string;
  objectName?: string;
  rawReference?: unknown;
  metadata?: Record<string, unknown>;
};

export type ComplianceContext = {
  device: Device;
  contexts: string[];
  snapshotRow: DiscoverySnapshot | null;
  snapshot: DeviceDiscoverySnapshot | null;
  collectedConfig: CollectedConfig | null;
  rawConfig: string;
  source: ComplianceSource;
  confidence: ComplianceConfidence;
  profile: CompliancePolicyProfile | null;
};

export function contextRequested(ctx: ComplianceContext, names: string[]): boolean {
  if (ctx.contexts.length === 0) return true;
  return names.some((name) => ctx.contexts.includes(name));
}

import type { Device } from "@workspace/db";
import type { DeviceDiscoverySnapshot } from "../netops/device-discovery/discovery.types.js";

export type ProvisioningServiceType =
  | "bgp_customer"
  | "bgp_provider"
  | "l3vpn_vrf"
  | "l2vpn_vpws"
  | "l2vpn_vpls"
  | "interface_subinterface"
  | "route_policy"
  | "community_filter"
  | "prefix_list";

export type ProvisioningPreviewStatus = "valid" | "warning" | "blocked";

export interface ProvisioningParameterField {
  type: string;
  description: string;
  required?: boolean;
  sensitive?: boolean;
}

export interface ProvisioningValidationItem {
  name: string;
  passed: boolean;
  message: string;
  severity?: "info" | "warn" | "error";
}

export interface ProvisioningRisk {
  code: string;
  message: string;
  severity: "info" | "warn" | "error";
}

export interface ProvisioningTemplateSummary {
  id: string;
  name: string;
  description: string;
  vendor: string;
  platform: string;
  serviceType: ProvisioningServiceType;
  parameterSchema: Record<string, ProvisioningParameterField>;
  risks: string[];
  precheckHints: string[];
  postcheckHints: string[];
  supported: boolean;
}

export interface ProvisioningTemplateDefinition extends ProvisioningTemplateSummary {
  configTemplate: string;
  rollbackTemplate: string;
}

export interface ProvisioningContext {
  device: Device;
  discovery: DeviceDiscoverySnapshot | null;
  discoveryAvailable: boolean;
}

export interface ProvisioningPreviewInput {
  deviceId: number;
  templateId: string;
  parameters: Record<string, unknown>;
  mode?: "dry_run" | string;
  maintenanceWindowStart?: string | null;
  maintenanceWindowEnd?: string | null;
  rollbackPlan?: string | null;
}

export interface ProvisioningPreviewResult {
  status: ProvisioningPreviewStatus;
  deviceId: number;
  templateId: string;
  serviceType: ProvisioningServiceType;
  configPreview: string;
  rollbackPreview: string;
  executionPlan: string[];
  validations: ProvisioningValidationItem[];
  risks: ProvisioningRisk[];
  precheckHints: string[];
  postcheckHints: string[];
  missingData: string[];
  blockedReasons: string[];
  applyBlocked: boolean;
  applyBlockedReason: string | null;
  maintenanceWindow: { start: string | null; end: string | null } | null;
  rollbackPlan: string | null;
}

export interface ProvisioningExportInput extends ProvisioningPreviewInput {
  format: "markdown" | "json";
}

export interface ProvisioningExportResult {
  format: "markdown" | "json";
  content: string;
  preview: ProvisioningPreviewResult;
}

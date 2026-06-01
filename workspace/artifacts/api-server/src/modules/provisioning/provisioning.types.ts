import type { Device } from "@workspace/db";
import type { DeviceDiscoverySnapshot } from "../netops/device-discovery/discovery.types.js";

export type ProvisioningServiceType =
  | "bgp_customer"
  | "bgp_provider"
  | "l3vpn_vrf"
  | "l3vpn"
  | "l2vpn_vpws"
  | "l2vpn_vpls"
  | "l2vpn"
  | "interface_subinterface"
  | "route_policy"
  | "community_filter"
  | "prefix_list";

export type ProvisioningFindingCode =
  | "VLAN_CONFLICT"
  | "SUBINTERFACE_EXISTS"
  | "INTERFACE_NOT_FOUND"
  | "L2VC_ID_CONFLICT"
  | "VSI_NAME_CONFLICT"
  | "VRF_CONFLICT"
  | "RD_CONFLICT"
  | "RT_CONFLICT"
  | "BGP_PEER_EXISTS"
  | "ROUTE_POLICY_MISSING"
  | "PREFIX_LIST_MISSING"
  | "COMMUNITY_FILTER_MISSING"
  | "TEMPLATE_MISSING"
  | "CONNECTOR_UNAVAILABLE"
  | "DEVICE_UNREACHABLE"
  | "SNAPSHOT_STALE"
  | "APPROVAL_REQUIRED"
  | "APPLY_DISABLED";

export interface ProvisioningFinding {
  code: ProvisioningFindingCode;
  severity: "info" | "warn" | "error";
  message: string;
  evidence: string[];
  recommendation: string;
  blocking: boolean;
}

export interface ProvisioningL2vpnParameters extends Record<string, unknown> {
  customerName: string;
  description?: string | null;
  deviceA: string | number;
  interfaceA: string;
  vlanA: string | number;
  qinqA?: string | number | null;
  deviceB: string | number;
  interfaceB: string;
  vlanB: string | number;
  qinqB?: string | number | null;
  type: "vpws" | "vpls" | "vsi" | "l2vc";
  serviceId: string;
  remotePeer?: string | null;
  notes?: string | null;
}

export interface ProvisioningL3vpnParameters extends Record<string, unknown> {
  customerName: string;
  description?: string | null;
  deviceId: string | number;
  interfaceName: string;
  vlan: string | number;
  vrfName: string;
  rd: string;
  rtImport: string;
  rtExport: string;
  ipWan: string;
  peerBgp: string;
  remoteAsn: string | number;
  importRoutePolicy: string;
  exportRoutePolicy: string;
  prefixList?: string | null;
  communityFilter?: string | null;
  notes?: string | null;
}

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
  findings?: ProvisioningFinding[];
  precheckHints: string[];
  postcheckHints: string[];
  missingData: string[];
  blockedReasons: string[];
  applyBlocked: boolean;
  applyBlockedReason: string | null;
  maintenanceWindow: { start: string | null; end: string | null } | null;
  rollbackPlan: string | null;
  validationResultJson?: string | null;
  renderedConfigJson?: string | null;
  renderedRollbackJson?: string | null;
  renderedValidationJson?: string | null;
  riskSummaryJson?: string | null;
}

export interface ProvisioningPreviewReport {
  findings: ProvisioningFinding[];
  configPreview: string;
  rollbackPreview: string;
  validationPreview: string;
  validationResultJson: string;
  renderedConfigJson: string;
  renderedRollbackJson: string;
  renderedValidationJson: string;
  riskSummaryJson: string;
}

export interface ProvisioningL2vpnPreviewInput {
  deviceAId: number;
  deviceBId: number;
  parameters: ProvisioningL2vpnParameters;
}

export interface ProvisioningL3vpnPreviewInput {
  deviceId: number;
  parameters: ProvisioningL3vpnParameters;
}

export interface ProvisioningStructuredValidationResult {
  validations: ProvisioningValidationItem[];
  findings: ProvisioningFinding[];
  risks: ProvisioningRisk[];
  missingData: string[];
  blockedReasons: string[];
}

export interface ProvisioningExportInput extends ProvisioningPreviewInput {
  format: "markdown" | "json";
}

export interface ProvisioningExportResult {
  format: "markdown" | "json";
  content: string;
  preview: ProvisioningPreviewResult;
}

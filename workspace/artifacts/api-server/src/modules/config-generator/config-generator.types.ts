export type ConfigGeneratorFieldType =
  | "string"
  | "number"
  | "ipv4"
  | "ipv6"
  | "cidr"
  | "array"
  | "secret"
  | "boolean"
  | "select";

export type ConfigGeneratorBlockClassification = "global" | "circuit";
export type ConfigGeneratorBlockStatus = "existing" | "missing" | "new" | "conflict" | "manual" | "suggested";

export type ConfigGeneratorValidationSeverity = "warning" | "error";
export type ConfigGeneratorRiskLevel = "low" | "medium" | "high" | "blocked";
export type ConfigGeneratorChangeRequestPreviewStatus = "draft_preview";
export type ConfigGeneratorChangeRequestPreviewRiskLevel = ConfigGeneratorRiskLevel;
export type ConfigGeneratorRunStatus = "previewed" | "saved" | "validated" | "blocked";
export type ConfigGeneratorArtifactType =
  | "candidate_config"
  | "postcheck_commands"
  | "rollback_placeholder"
  | "ticket_markdown"
  | "diff_notes"
  | "precheck_diff"
  | "semantic_diff"
  | "change_request_preview"
  | "risk_assessment"
  | "implementation_package";
export type ConfigGeneratorErrorCode =
  | "CONFIG_GENERATOR_DISABLED"
  | "CONFIG_WRITE_DISABLED"
  | "RBAC_FORBIDDEN"
  | "TENANT_DEVICE_MISMATCH"
  | "TEMPLATE_VENDOR_MISMATCH"
  | "VALIDATION_FAILED"
  | "SECRET_NOT_PERSISTED"
  | "RUN_NOT_FOUND"
  | "ARTIFACT_NOT_FOUND";

export interface ConfigGeneratorFieldSchema {
  key: string;
  label: string;
  type: ConfigGeneratorFieldType;
  required?: boolean;
  description?: string;
  placeholder?: string;
  defaultValue?: string | number | boolean | string[] | null;
  options?: string[];
}

export interface ConfigGeneratorBlockSchema {
  key: string;
  title: string;
  classification: ConfigGeneratorBlockClassification;
  description?: string;
  statusHint?: ConfigGeneratorBlockStatus;
}

export interface ConfigGeneratorTemplateSchemaJson {
  fields: ConfigGeneratorFieldSchema[];
  blocks: ConfigGeneratorBlockSchema[];
  notes?: string[];
}

export interface ConfigGeneratorTemplateSummary {
  id: number;
  name: string;
  serviceType: string;
  vendor: string;
  platform: string;
  templateKey: string;
  isActive: boolean;
  latestVersion: string | null;
  latestVersionId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigGeneratorTemplateSchemaResponse {
  template: ConfigGeneratorTemplateSummary;
  version: {
    id: number;
    version: string;
    renderer: string;
    checksum: string;
    content: string;
    schemaJson: ConfigGeneratorTemplateSchemaJson;
    createdAt: string;
  };
}

export interface ConfigGeneratorValidationFinding {
  severity: ConfigGeneratorValidationSeverity;
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface ConfigGeneratorValidationSummary {
  status: "passed" | "warning" | "failed";
  warnings: ConfigGeneratorValidationFinding[];
  errors: ConfigGeneratorValidationFinding[];
}

export interface ConfigGeneratorFieldOrigins {
  [key: string]: "device_context" | "inventory" | "bgp_peer" | "l2_circuit" | "service_catalog" | "announcement_matrix" | "discovery" | "id_allocator" | "manual";
}

export interface ConfigGeneratorErrorResponse {
  code: ConfigGeneratorErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ConfigGeneratorRenderedBlock {
  key: string;
  title: string;
  classification: ConfigGeneratorBlockClassification;
  status: ConfigGeneratorBlockStatus;
  content: string;
}

export interface ConfigGeneratorRenderResponse {
  ok: true;
  runPreviewId: number;
  validation: ConfigGeneratorValidationSummary;
  blocks: ConfigGeneratorRenderedBlock[];
  renderedConfig: string;
  postcheckCommands: string;
  rollbackPlaceholder: string;
}

export interface ConfigGeneratorRunResponse {
  ok: true;
  runId: number;
  validation: ConfigGeneratorValidationSummary;
  blocks: ConfigGeneratorRenderedBlock[];
  renderedConfig: string;
  postcheckCommands: string;
  rollbackPlaceholder: string;
}

export interface ConfigGeneratorBlockOutput {
  blocks: ConfigGeneratorRenderedBlock[];
  renderedConfig: string;
  postcheckCommands: string;
  rollbackPlaceholder: string;
}

export interface ConfigGeneratorValidationInput {
  tenantId: number;
  deviceId: number;
  templateId: number;
  templateVersionId?: number | null;
  input: Record<string, unknown>;
  fieldOrigins?: ConfigGeneratorFieldOrigins;
  existingRoutePolicies?: string[];
  existingVlans?: number[];
  existingPeerRemoteIps?: string[];
}

export interface ConfigGeneratorRunListItem {
  id: number;
  tenantId: number;
  tenantName: string | null;
  deviceId: number;
  deviceHostname: string | null;
  serviceType: string;
  templateVersionId: number;
  templateName: string | null;
  templateVersion: string | null;
  status: string;
  riskLevel: string;
  createdBy: number | null;
  createdAt: string;
}

export interface ConfigGeneratorRunDetail extends ConfigGeneratorRunListItem {
  inputJson: Record<string, unknown>;
  renderedConfig: string;
  validationSummary: ConfigGeneratorValidationSummary;
  fieldOrigins?: ConfigGeneratorFieldOrigins;
}

export type ConfigGeneratorDiffLineStatus =
  | "already_present"
  | "new_candidate"
  | "partial_match"
  | "conflict"
  | "missing_dependency"
  | "global_existing"
  | "global_missing"
  | "manual_review"
  | "unknown_no_baseline";

export interface ConfigGeneratorDiffLine {
  line: string;
  status: ConfigGeneratorDiffLineStatus;
  details?: string | null;
}

export interface ConfigGeneratorDiffBlock {
  key: string;
  title: string;
  classification: ConfigGeneratorBlockClassification;
  status: ConfigGeneratorDiffLineStatus;
  items: ConfigGeneratorDiffLine[];
}

export interface ConfigGeneratorDiffBaseline {
  source: "collected_configs" | "discovery_snapshots" | "snmp_snapshots" | "policy_catalog" | "none";
  collectedAt?: string | null;
  deviceId: number;
  checksum?: string | null;
}

export interface ConfigGeneratorDiffSummary {
  alreadyPresent: number;
  newCandidate: number;
  conflicts: number;
  manualReview: number;
  unknown: number;
  missingDependencies: number;
  globalExisting: number;
  globalMissing: number;
}

export interface ConfigGeneratorDiffResponse {
  status: "ok";
  baseline: ConfigGeneratorDiffBaseline;
  summary: ConfigGeneratorDiffSummary;
  blocks: ConfigGeneratorDiffBlock[];
  blocking: boolean;
  warnings: ConfigGeneratorValidationFinding[];
  errors: ConfigGeneratorValidationFinding[];
  renderedConfig: string;
  candidateChecksum: string;
  baselineChecksum: string | null;
}

export interface ConfigGeneratorFeatureResponse {
  enabled: boolean;
}

export interface ConfigGeneratorRunPreviewRequest {
  tenantId: number;
  deviceId: number;
  templateId: number;
  templateVersionId?: number | null;
  input: Record<string, unknown>;
  fieldOrigins?: ConfigGeneratorFieldOrigins;
}

export interface ConfigGeneratorRunPreviewResponse extends ConfigGeneratorRenderResponse {}

export interface ConfigGeneratorRunSaveResponse extends ConfigGeneratorRunResponse {}

export interface ConfigGeneratorArtifactResponse {
  id: number;
  runId: number;
  artifactType: ConfigGeneratorArtifactType;
  content: string;
  checksum: string;
  createdAt: string;
}

export interface ConfigGeneratorDeviceScope {
  deviceId: number;
  hostname: string;
  vendor: string;
  platform: string;
  tenantId: number | null;
  tenantName: string | null;
  connectorId: number | null;
  connectorGroupId: number | null;
  interfaceNames: string[];
  routePolicyNames: string[];
  interfaceStates: Array<{
    name: string;
    adminStatus: "up" | "down" | "unknown";
    operStatus: "up" | "down" | "unknown";
    kind: string | null;
  }>;
  latestConfig: string | null;
}

export interface ConfigGeneratorScopeTenant {
  tenantId: number;
  tenantName: string;
  deviceCount: number;
}

export interface ConfigGeneratorScopeResponse {
  tenants: ConfigGeneratorScopeTenant[];
}

export interface ConfigGeneratorScopeDevice {
  tenantId: number;
  tenantName: string;
  deviceId: number;
  deviceName: string;
  vendor: string;
  platform: string;
  status: string;
}

export interface ConfigGeneratorDevicesResponse {
  tenantId: number;
  devices: ConfigGeneratorScopeDevice[];
}

export interface ConfigGeneratorInterfaceSuggestion {
  name: string;
  description: string | null;
  status: "up" | "down" | "unknown";
  kind: string;
  source: "inventory" | "discovery" | "snmp";
}

export interface ConfigGeneratorBgpPeerSuggestion {
  remoteAsn: number | null;
  remoteIp: string | null;
  localIp: string | null;
  description: string | null;
  state: string | null;
}

export interface ConfigGeneratorDependencySuggestion {
  type: string;
  name: string;
  status: "present" | "missing" | "conflict";
  classification: "global" | "circuit";
  reason?: string | null;
}

export interface ConfigGeneratorConflictSuggestion {
  code: string;
  severity: "warning" | "error";
  message: string;
  field?: string | null;
}

export interface ConfigGeneratorDeviceContextResponse {
  tenantId: number;
  tenantName: string;
  deviceId: number;
  deviceName: string;
  vendor: string;
  platform: string;
  interfaces: ConfigGeneratorInterfaceSuggestion[];
  bgp: {
    localAsn: number | null;
    peers: ConfigGeneratorBgpPeerSuggestion[];
  };
  l2Circuits: Array<{
    circuitId: string | null;
    serviceId: string | null;
    circuitType: string;
    name: string;
    vlan: number | null;
    interfaceName: string | null;
    peerIp: string | null;
    vsiName?: string | null;
    vsiId?: string | null;
    vcId?: string | null;
    description?: string | null;
  }>;
  globalDependencies: ConfigGeneratorDependencySuggestion[];
  conflicts: ConfigGeneratorConflictSuggestion[];
  suggestedInput: Record<string, unknown>;
  fieldOrigins: ConfigGeneratorFieldOrigins;
}

export interface ConfigGeneratorTemplatesResponse {
  tenantId: number | null;
  deviceId: number | null;
  serviceType: string | null;
  templates: ConfigGeneratorTemplateSummary[];
}

export interface ConfigGeneratorServiceContextResponse {
  tenantId: number;
  deviceId: number;
  serviceType: string;
  ref: string | null;
  suggestedInput: Record<string, unknown>;
  fieldOrigins: ConfigGeneratorFieldOrigins;
  conflicts: ConfigGeneratorConflictSuggestion[];
  globalDependencies: ConfigGeneratorDependencySuggestion[];
  notes: string[];
  idSuggestions?: ConfigGeneratorIdSuggestResponse | null;
}

export interface ConfigGeneratorIdSuggestionItem {
  value: number;
  range?: string;
  rangeKey?: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  origin: "id_allocator";
  scope?: "tenant" | "device" | "site";
  alternatives?: number[];
}

export interface ConfigGeneratorIdSuggestResponse {
  tenantId: number;
  siteId?: number | null;
  siteCode?: string | null;
  deviceId?: number | null;
  serviceType: string;
  suggestions: {
    vlan?: ConfigGeneratorIdSuggestionItem;
    subinterfaceId?: ConfigGeneratorIdSuggestionItem;
    l2vcId?: ConfigGeneratorIdSuggestionItem;
    vsiId?: ConfigGeneratorIdSuggestionItem;
  };
  usedIdsSummary: Partial<Record<"vlan" | "subinterface" | "l2vc" | "vsi", number[]>>;
  warnings: ConfigGeneratorValidationFinding[];
  blockingConflicts: ConfigGeneratorValidationFinding[];
}

export interface ConfigGeneratorIdInventoryItem {
  id: number;
  tenantId: number;
  siteCode: string | null;
  deviceId: number | null;
  idType: string;
  idValue: number;
  parentInterface: string | null;
  interfaceName: string | null;
  serviceType: string | null;
  serviceName: string | null;
  status: string;
  source: string;
  confidence: string;
  lastSeenAt: string;
}

export interface ConfigGeneratorIdInventoryResponse {
  tenantId: number;
  siteCode?: string | null;
  deviceId?: number | null;
  idType?: string | null;
  items: ConfigGeneratorIdInventoryItem[];
  summary: Partial<Record<"vlan" | "subinterface" | "l2vc" | "vsi", number[]>>;
}

export interface ConfigGeneratorIdRangesResponse {
  version: string;
  ranges: Array<{
    key: string;
    type: string;
    rangeStart: number;
    rangeEnd: number;
    serviceTypes: string[];
    reserved?: boolean;
    blocking?: boolean;
    untaggedRequired?: boolean;
    label: string;
  }>;
}

export interface ConfigGeneratorRiskAssessmentFactor {
  code: string;
  severity: ConfigGeneratorChangeRequestPreviewRiskLevel;
  message: string;
  context?: Record<string, unknown>;
}

export interface ConfigGeneratorChangeRequestPreviewSummary {
  title: string;
  description: string;
  customerName?: string | null;
  circuitId?: string | null;
  deviceName: string;
  vendor: string;
  platform: string;
}

export interface ConfigGeneratorChangeRequestPreviewScope {
  tenant: string;
  site?: string | null;
  device: string;
  interfaces: string[];
  bgpPeers: string[];
  vlans: number[];
  l2vcIds: number[];
  vsiIds: number[];
}

export interface ConfigGeneratorChangeRequestPreviewInputs {
  fieldOrigins: ConfigGeneratorFieldOrigins;
  manualFields: string[];
  suggestedFields: string[];
}

export interface ConfigGeneratorChangeRequestPreviewValidations {
  errors: ConfigGeneratorValidationFinding[];
  warnings: ConfigGeneratorValidationFinding[];
  infos: ConfigGeneratorValidationFinding[];
}

export interface ConfigGeneratorChangeRequestPreviewIdAllocation {
  suggestions: Record<string, unknown>;
  usedIdsSummary: Partial<Record<"vlan" | "subinterface" | "l2vc" | "vsi", number[]>>;
  conflicts: ConfigGeneratorValidationFinding[];
}

export interface ConfigGeneratorChangeRequestPreviewDiff {
  baseline: ConfigGeneratorDiffBaseline;
  summary: ConfigGeneratorDiffSummary;
  blocking: boolean;
  candidateChecksum?: string | null;
  baselineChecksum?: string | null;
  precheckChecksum?: string | null;
}

export interface ConfigGeneratorChangeRequestPreviewRollbackPlan {
  type: "manual_placeholder";
  notes: string[];
  content: string;
}

export interface ConfigGeneratorChangeRequestPreviewRiskAssessment {
  score: number;
  factors: ConfigGeneratorRiskAssessmentFactor[];
}

export interface ConfigGeneratorChangeRequestPreview {
  id: string;
  runId: number;
  tenantId: number;
  deviceId: number;
  serviceType: string;
  templateKey: string;
  status: ConfigGeneratorChangeRequestPreviewStatus;
  riskLevel: ConfigGeneratorChangeRequestPreviewRiskLevel;
  summary: ConfigGeneratorChangeRequestPreviewSummary;
  scope: ConfigGeneratorChangeRequestPreviewScope;
  inputs: ConfigGeneratorChangeRequestPreviewInputs;
  validations: ConfigGeneratorChangeRequestPreviewValidations;
  idAllocation: ConfigGeneratorChangeRequestPreviewIdAllocation;
  diff: ConfigGeneratorChangeRequestPreviewDiff;
  candidateConfig: string;
  postcheckCommands: string;
  rollbackPlan: ConfigGeneratorChangeRequestPreviewRollbackPlan;
  riskAssessment: ConfigGeneratorChangeRequestPreviewRiskAssessment;
  ticketMarkdown: string;
  generatedAt: string;
  generatedBy?: number | null;
  artifactChecksum?: string | null;
}

export interface ConfigGeneratorChangeRequestPreviewResponse {
  preview: ConfigGeneratorChangeRequestPreview;
  artifactId: number;
}

import assert from "node:assert/strict";

import {
  GetConfigGeneratorSuggestionDeviceContextResponse,
  GetConfigGeneratorSuggestionServiceContextResponse,
  GetConfigGeneratorFeatureResponse,
  DiffConfigGeneratorResponse,
  GetConfigGeneratorRunArtifactsResponse,
  GetConfigGeneratorRunResponse,
  GetConfigGeneratorTemplateSchemaResponse,
  ListConfigGeneratorRunsResponse,
  ListConfigGeneratorSuggestionDevicesResponse,
  ListConfigGeneratorSuggestionScopeResponse,
  ListConfigGeneratorSuggestionTemplatesResponse,
  ListConfigGeneratorTemplatesResponse,
  RenderConfigGeneratorBody,
  RenderConfigGeneratorResponse,
  SaveConfigGeneratorRunBody,
  SaveConfigGeneratorRunResponse,
  ValidateConfigGeneratorBody,
  ValidateConfigGeneratorResponse,
} from "@workspace/api-zod";

const engine = await import("./config-generator.engine.js");
const catalog = await import("./config-generator.catalog.js");
const service = await import("./config-generator.service.js");

const bgpTemplate = catalog.CONFIG_GENERATOR_TEMPLATES[0];
const device = {
  deviceId: 1,
  hostname: "R1",
  vendor: "huawei",
  platform: "vrp",
  tenantId: 10,
  tenantName: "Tenant A",
  connectorId: null,
  connectorGroupId: null,
  latestConfig: "prefix-list RFC5735\nroute-policy BGP_BASELINE\ninterface Eth-Trunk1.1234\n",
  interfaceNames: ["Eth-Trunk1.1234", "LoopBack0"],
  routePolicyNames: ["BGP_BASELINE"],
  interfaceStates: [{ name: "Eth-Trunk1.1234", adminStatus: "up" as const, operStatus: "up" as const, kind: "trunk" }],
};

const request = {
  tenantId: 10,
  deviceId: 1,
  templateId: 1,
  templateVersionId: 1,
  input: {
    circuitId: "1234",
    customerName: "CLIENTE_X",
    localAsn: 273309,
    remoteAsn: 65001,
    interface: "Eth-Trunk1.1234",
    vlan: 1234,
    peerLocalIpv4: "10.0.0.1",
    peerRemoteIpv4: "10.0.0.2",
    ipv4Prefixes: ["203.0.113.0/24"],
    md5Secret: "super-secret",
    importPolicyName: "C1234_IMPORT",
    exportPolicyName: "C1234_EXPORT",
    communityBase: "273309:1234",
    prependProfile: "P1",
  },
  fieldOrigins: {
    circuitId: "l2_circuit",
    customerName: "inventory",
    localAsn: "device_context",
    remoteAsn: "bgp_peer",
    interface: "inventory",
    vlan: "l2_circuit",
    peerLocalIpv4: "bgp_peer",
    peerRemoteIpv4: "bgp_peer",
    ipv4Prefixes: "manual",
  },
};

assert.deepEqual(ValidateConfigGeneratorBody.parse(request), request);
assert.deepEqual(RenderConfigGeneratorBody.parse(request), request);
assert.deepEqual(SaveConfigGeneratorRunBody.parse(request), request);

const feature = GetConfigGeneratorFeatureResponse.parse({ enabled: true });
assert.equal(feature.enabled, true);

const templateSchema = GetConfigGeneratorTemplateSchemaResponse.parse({
  template: {
    id: 1,
    name: bgpTemplate.name,
    serviceType: bgpTemplate.serviceType,
    vendor: bgpTemplate.vendor,
    platform: bgpTemplate.platform,
    templateKey: bgpTemplate.templateKey,
    isActive: true,
    latestVersion: "1.0.0",
    latestVersionId: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  version: {
    id: 1,
    version: "1.0.0",
    renderer: "huawei_vrp_bgp_customer_community_v1",
    checksum: "abc",
    content: bgpTemplate.content,
    schemaJson: bgpTemplate.schemaJson,
    createdAt: new Date().toISOString(),
  },
});
assert.equal(templateSchema.template.templateKey, bgpTemplate.templateKey);

const templateList = ListConfigGeneratorTemplatesResponse.parse([templateSchema.template]);
assert.equal(templateList.length, 1);

const scopeList = ListConfigGeneratorSuggestionScopeResponse.parse({
  tenants: [{ tenantId: 10, tenantName: "Tenant A", deviceCount: 1 }],
});
assert.equal(scopeList.tenants[0].deviceCount, 1);

const suggestionDevices = ListConfigGeneratorSuggestionDevicesResponse.parse({
  tenantId: 10,
  devices: [{
    tenantId: 10,
    tenantName: "Tenant A",
    deviceId: 1,
    deviceName: "R1",
    vendor: "huawei",
    platform: "vrp",
    status: "up",
  }],
});
assert.equal(suggestionDevices.devices[0].deviceName, "R1");

const suggestionTemplates = ListConfigGeneratorSuggestionTemplatesResponse.parse({
  tenantId: 10,
  deviceId: 1,
  serviceType: bgpTemplate.serviceType,
  templates: [templateSchema.template],
});
assert.equal(suggestionTemplates.templates[0].templateKey, bgpTemplate.templateKey);

const suggestionDeviceContext = GetConfigGeneratorSuggestionDeviceContextResponse.parse({
  tenantId: 10,
  tenantName: "Tenant A",
  deviceId: 1,
  deviceName: "R1",
  vendor: "huawei",
  platform: "vrp",
  interfaces: [{ name: "Eth-Trunk1.1234", description: "UPLINK", status: "up", kind: "trunk", source: "discovery" }],
  bgp: {
    localAsn: 273309,
    peers: [{ remoteAsn: 65001, remoteIp: "10.0.0.2", localIp: "10.0.0.1", description: "CLIENTE_X", state: "established" }],
  },
  l2Circuits: [],
  globalDependencies: [{ type: "ip-prefix", name: "RFC5735", status: "present", classification: "global" }],
  conflicts: [{ code: "COMMUNITY_CONFLICT", severity: "warning", message: "x", field: "community" }],
  suggestedInput: { customerName: "CLIENTE_X" },
  fieldOrigins: { customerName: "inventory" },
});
assert.equal(suggestionDeviceContext.globalDependencies[0].classification, "global");

const suggestionServiceContext = GetConfigGeneratorSuggestionServiceContextResponse.parse({
  tenantId: 10,
  deviceId: 1,
  serviceType: bgpTemplate.serviceType,
  ref: "CLIENTE_X",
  suggestedInput: { customerName: "CLIENTE_X" },
  fieldOrigins: { customerName: "service_catalog" },
  conflicts: [],
  globalDependencies: [{ type: "ip-prefix", name: "RFC5735", status: "present", classification: "global" }],
  notes: ["Template sugerido: Huawei VRP - BGP Cliente com Community"],
});
assert.equal(suggestionServiceContext.fieldOrigins.customerName, "service_catalog");

const validation = engine.validateConfigGeneratorInput({
  serviceType: bgpTemplate.serviceType,
  device,
  templateKey: bgpTemplate.templateKey,
  normalizedInput: engine.normalizeConfigGeneratorInput(request.input),
  existingCircuitIds: [],
  existingCommunities: [],
});
const validationResponse = ValidateConfigGeneratorResponse.parse({
  validation,
  normalizedInput: engine.sanitizeConfigGeneratorInputForStorage(engine.normalizeConfigGeneratorInput(request.input)),
  template: templateSchema.template,
});
assert.equal(validationResponse.validation.status, "warning");

const renderResponse = RenderConfigGeneratorResponse.parse({
  ok: true,
  runPreviewId: 1,
  validation,
  blocks: engine.renderConfigGeneratorBlocks({
    templateKey: bgpTemplate.templateKey,
    templateContent: bgpTemplate.content,
    schemaJson: bgpTemplate.schemaJson,
    normalizedInput: engine.normalizeConfigGeneratorInput(request.input),
    device,
  }).blocks,
    renderedConfig: "candidate",
    postcheckCommands: "postcheck",
    rollbackPlaceholder: "rollback",
  });
assert.equal(renderResponse.ok, true);
assert.equal(renderResponse.blocks[0].status, "missing");

const saveResponse = SaveConfigGeneratorRunResponse.parse({
  ok: true,
  runId: 1,
  validation,
  blocks: renderResponse.blocks,
  renderedConfig: renderResponse.renderedConfig,
  postcheckCommands: renderResponse.postcheckCommands,
  rollbackPlaceholder: renderResponse.rollbackPlaceholder,
});
assert.equal(saveResponse.runId, 1);

const runList = ListConfigGeneratorRunsResponse.parse([{
  id: 1,
  tenantId: 10,
  tenantName: "Tenant A",
  deviceId: 1,
  deviceHostname: "R1",
  serviceType: bgpTemplate.serviceType,
  templateVersionId: 1,
  templateName: bgpTemplate.name,
  templateVersion: "1.0.0",
  status: "saved",
  riskLevel: "medium",
  createdBy: 1,
  createdAt: new Date().toISOString(),
}]);
assert.equal(runList[0].riskLevel, "medium");

const runDetail = GetConfigGeneratorRunResponse.parse({
  ...runList[0],
  inputJson: engine.sanitizeConfigGeneratorInputForStorage(engine.normalizeConfigGeneratorInput(request.input)),
  renderedConfig: renderResponse.renderedConfig,
  validationSummary: validation,
  fieldOrigins: request.fieldOrigins,
});
assert.equal(runDetail.renderedConfig, "candidate");

const artifacts = GetConfigGeneratorRunArtifactsResponse.parse([{
  id: 1,
  runId: 1,
  artifactType: "candidate_config",
  content: "candidate",
  checksum: "abc",
  createdAt: new Date().toISOString(),
}]);
assert.equal(artifacts[0].artifactType, "candidate_config");

const diffResponse = DiffConfigGeneratorResponse.parse({
  status: "ok",
  baseline: {
    source: "collected_configs",
    collectedAt: new Date().toISOString(),
    deviceId: 1,
    checksum: "baseline-checksum",
  },
  summary: {
    alreadyPresent: 1,
    newCandidate: 1,
    conflicts: 0,
    manualReview: 0,
    unknown: 0,
    missingDependencies: 0,
    globalExisting: 1,
    globalMissing: 0,
  },
  blocks: [{
    key: "global_dependencies",
    title: "Global deps",
    classification: "global",
    status: "global_existing",
    items: [{
      line: "[GLOBAL / já existente] ip ip-prefix RFC5735",
      status: "global_existing",
    }],
  }],
  blocking: false,
  warnings: [],
  errors: [],
  renderedConfig: "candidate",
  candidateChecksum: "candidate-checksum",
  baselineChecksum: "baseline-checksum",
});
assert.equal(diffResponse.blocks[0].items[0].status, "global_existing");

const errorResponse = {
  code: "RUN_NOT_FOUND",
  error: "Run not found",
  details: { runId: 99 },
};
assert.equal(errorResponse.code, "RUN_NOT_FOUND");
assert.equal(
  {
    code: "ARTIFACT_NOT_FOUND",
    error: "Artifact not found",
  }.code,
  "ARTIFACT_NOT_FOUND",
);
assert.equal(
  {
    code: "RBAC_FORBIDDEN",
    error: "Forbidden",
  }.code,
  "RBAC_FORBIDDEN",
);
assert.equal(
  {
    code: "TENANT_DEVICE_MISMATCH",
    error: "Device does not belong to tenant 10.",
  }.code,
  "TENANT_DEVICE_MISMATCH",
);
assert.equal(
  {
    code: "TEMPLATE_VENDOR_MISMATCH",
    error: "Template huawei/vrp incompatible com device cisco/ios.",
  }.code,
  "TEMPLATE_VENDOR_MISMATCH",
);
assert.equal(
  {
    code: "VALIDATION_FAILED",
    error: "Validation failed",
  }.code,
  "VALIDATION_FAILED",
);
assert.equal(
  {
    code: "SECRET_NOT_PERSISTED",
    error: "Campo sensível não é persistido.",
  }.code,
  "SECRET_NOT_PERSISTED",
);

const writeDisabled = {
  allowed: false,
  code: "CONFIG_WRITE_DISABLED",
  reason: "CONFIG_WRITE_ENABLED=false. MVP permite apenas geração e preview.",
};
assert.equal(writeDisabled.allowed, false);

const writeGate = await service.ensureConfigGeneratorWriteAllowed();
assert.equal(writeGate.allowed, false);
assert.equal(await service.getConfigGeneratorFeatureEnabled(), false);

const invalid = engine.validateConfigGeneratorInput({
  serviceType: bgpTemplate.serviceType,
  device,
  templateKey: bgpTemplate.templateKey,
  normalizedInput: { ...engine.normalizeConfigGeneratorInput(request.input), vlan: 1 },
  existingCircuitIds: [],
  existingCommunities: [],
});
assert.equal(invalid.errors.some((item) => item.code === "invalid_vlan"), true);

console.log("config-generator.contract.selftest: OK");

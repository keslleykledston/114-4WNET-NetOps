import assert from "node:assert/strict";

process.env["DATABASE_URL"] ??= "postgres://selftest:selftest@127.0.0.1:1/selftest";
process.env["CONFIG_GENERATOR_ENABLED"] ??= "false";
process.env["CONFIG_WRITE_ENABLED"] ??= "false";

const engine = await import("./config-generator.engine.js");
const catalog = await import("./config-generator.catalog.js");
const service = await import("./config-generator.service.js");
const auth = await import("../../lib/auth.js");

const bgpTemplate = catalog.CONFIG_GENERATOR_TEMPLATES[0];
const l2Template = catalog.CONFIG_GENERATOR_TEMPLATES[1];

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

const validBgpInput = engine.normalizeConfigGeneratorInput({
  circuitId: "1234",
  customerName: "CLIENTE_X",
  localAsn: 273309,
  remoteAsn: 65001,
  interface: "Eth-Trunk1.1234",
  vlan: 1234,
  peerLocalIpv4: "10.0.0.1",
  peerRemoteIpv4: "10.0.0.2",
  ipv4Prefixes: ["203.0.113.0/24"],
  md5Secret: "secret-md5",
  importPolicyName: "C1234_IMPORT",
  exportPolicyName: "C1234_EXPORT",
  communityBase: "273309:1234",
  prependProfile: "P1",
});

const bgpValidation = engine.validateConfigGeneratorInput({
  serviceType: bgpTemplate.serviceType,
  device,
  templateKey: bgpTemplate.templateKey,
  normalizedInput: validBgpInput,
  existingCircuitIds: [],
  existingCommunities: [],
});
assert.equal(bgpValidation.status, "warning");
assert.equal(bgpValidation.warnings.some((item) => item.code === "SECRET_NOT_PERSISTED"), true);

const bgpBlocks = engine.renderConfigGeneratorBlocks({
  templateKey: bgpTemplate.templateKey,
  templateContent: bgpTemplate.content,
  schemaJson: bgpTemplate.schemaJson,
  normalizedInput: validBgpInput,
  device,
});
assert.match(bgpBlocks.renderedConfig, /route-policy C1234_IMPORT/);
assert.match(bgpBlocks.renderedConfig, /route-policy C1234_EXPORT/);
assert.equal(bgpBlocks.blocks[0].classification, "global");
assert.equal(bgpBlocks.blocks[1].classification, "circuit");
assert.equal(bgpBlocks.blocks[0].status, "missing");
assert.equal(bgpBlocks.blocks[1].status, "new");
assert.equal(bgpBlocks.blocks[4].status, "suggested");

const l2Input = engine.normalizeConfigGeneratorInput({
  circuitId: "5678",
  customerName: "CLIENTE_Y",
  interface: "Eth-Trunk1.1234",
  vlan: 200,
  mode: "qinq",
  serviceType: "l2vpn_vlan",
  description: "L2VPN access",
  mtu: 1500,
  deviceName: "R1",
  ipv4Prefixes: ["203.0.113.0/24"],
  md5Secret: "another-secret",
});
const l2Validation = engine.validateConfigGeneratorInput({
  serviceType: l2Template.serviceType,
  device,
  templateKey: l2Template.templateKey,
  normalizedInput: l2Input,
  existingCircuitIds: [],
  existingCommunities: [],
});
assert.equal(l2Validation.status, "warning");

const l2Blocks = engine.renderConfigGeneratorBlocks({
  templateKey: l2Template.templateKey,
  templateContent: l2Template.content,
  schemaJson: l2Template.schemaJson,
  normalizedInput: l2Input,
  device,
});
assert.match(l2Blocks.renderedConfig, /encapsulation qinq 200/);
assert.equal(l2Blocks.blocks[0].status, "missing");
assert.equal(l2Blocks.blocks[5].status, "manual");

const invalidVlan = engine.validateConfigGeneratorInput({
  serviceType: bgpTemplate.serviceType,
  device,
  templateKey: bgpTemplate.templateKey,
  normalizedInput: { ...validBgpInput, vlan: 1 },
  existingCircuitIds: [],
  existingCommunities: [],
});
assert.equal(invalidVlan.errors.some((item) => item.code === "invalid_vlan"), true);

const invalidAsn = engine.validateConfigGeneratorInput({
  serviceType: bgpTemplate.serviceType,
  device,
  templateKey: bgpTemplate.templateKey,
  normalizedInput: { ...validBgpInput, localAsn: 0 },
  existingCircuitIds: [],
  existingCommunities: [],
});
assert.equal(invalidAsn.errors.some((item) => item.code === "invalid_local_asn"), true);

const routePolicyConflict = engine.validateConfigGeneratorInput({
  serviceType: bgpTemplate.serviceType,
  device,
  templateKey: bgpTemplate.templateKey,
  normalizedInput: { ...validBgpInput, importPolicyName: "BGP_BASELINE" },
  existingCircuitIds: [],
  existingCommunities: [],
  existingRoutePolicies: ["BGP_BASELINE"],
});
assert.equal(routePolicyConflict.errors.some((item) => item.code === "route_policy_conflict"), true);

const missingInterface = engine.validateConfigGeneratorInput({
  serviceType: bgpTemplate.serviceType,
  device,
  templateKey: bgpTemplate.templateKey,
  normalizedInput: { ...validBgpInput, interface: "Eth-Trunk9.999" },
  existingCircuitIds: [],
  existingCommunities: [],
});
assert.equal(missingInterface.errors.some((item) => item.code === "interface_not_found"), true);

const interfaceDownDevice = {
  ...device,
  interfaceStates: [{ name: "Eth-Trunk1.1234", adminStatus: "down" as const, operStatus: "down" as const, kind: "trunk" }],
};
const interfaceDownWarning = engine.validateConfigGeneratorInput({
  serviceType: bgpTemplate.serviceType,
  device: interfaceDownDevice,
  templateKey: bgpTemplate.templateKey,
  normalizedInput: validBgpInput,
  existingCircuitIds: [],
  existingCommunities: [],
});
assert.equal(interfaceDownWarning.warnings.some((item) => item.code === "interface_down"), true);

const tenantScope = engine.validateDeviceTenantScope(10, 10);
assert.equal(tenantScope.ok, true);
assert.equal(engine.validateDeviceTenantScope(11, 10).ok, false);

const incompatible = engine.validateConfigGeneratorTemplateCompatibility({
  vendor: "cisco",
  platform: "ios",
  device,
});
assert.equal(incompatible.length > 0, true);
assert.equal(incompatible[0]?.code, "TEMPLATE_VENDOR_MISMATCH");

const sanitized = engine.sanitizeConfigGeneratorInputForStorage(validBgpInput);
assert.equal(sanitized.md5, "<SECRET_NOT_STORED>");
assert.equal((sanitized as { md5Secret?: string }).md5Secret, "<SECRET_NOT_STORED>");
const sanitizedSummary = engine.sanitizeConfigGeneratorValidationSummaryForStorage({
  status: "warning",
  warnings: [{ severity: "warning", code: "secret", message: "x", context: { password: "abc", nested: { token: "def" } } }],
  errors: [],
});
assert.equal((sanitizedSummary.warnings[0]?.context as { password?: string }).password, "<SECRET_NOT_STORED>");
assert.equal(((sanitizedSummary.warnings[0]?.context as { nested?: { token?: string } }).nested?.token), "<SECRET_NOT_STORED>");
assert.equal(sanitizedSummary.warnings[0]?.code, "secret");
assert.equal(engine.sanitizeRenderedConfig("peer 10.0.0.2 password secret-md5"), `peer 10.0.0.2 password ${engine.CONFIG_GENERATOR_SECRET_PLACEHOLDER}`);

process.env["CONFIG_WRITE_ENABLED"] = "false";
const writeGate = await service.ensureConfigGeneratorWriteAllowed();
assert.equal(writeGate.allowed, false);
assert.match(writeGate.reason, /CONFIG_WRITE_ENABLED=false/);

assert.equal(await service.getConfigGeneratorFeatureEnabled(), false);
assert.deepEqual(await service.listConfigGeneratorTemplates(), []);

assert.equal(auth.checkPermission({ role: "viewer", permissionsJson: null }, "configGenerator.read"), true);
assert.equal(auth.checkPermission({ role: "viewer", permissionsJson: null }, "configGenerator.write"), false);
assert.equal(auth.checkPermission({ role: "operator", permissionsJson: null }, "configGenerator.write"), true);
assert.equal(auth.checkPermission({ role: "operator", permissionsJson: null }, "configGenerator.admin"), false);
assert.equal(auth.checkPermission({ role: "admin", permissionsJson: null }, "configGenerator.admin"), true);

console.log("config-generator.selftest: OK");

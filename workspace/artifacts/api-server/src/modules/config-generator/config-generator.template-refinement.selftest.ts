import assert from "node:assert/strict";

process.env["DATABASE_URL"] ??= "postgres://selftest:selftest@127.0.0.1:1/selftest";
process.env["CONFIG_GENERATOR_ENABLED"] ??= "false";
process.env["CONFIG_WRITE_ENABLED"] ??= "false";

const engine = await import("./config-generator.engine.js");
const catalog = await import("./config-generator.catalog.js");

const bgpTemplate = catalog.CONFIG_GENERATOR_TEMPLATES[0];
const l2Template = catalog.CONFIG_GENERATOR_TEMPLATES[1];

const device = {
  deviceId: 1,
  hostname: "PE-01",
  vendor: "huawei",
  platform: "vrp",
  tenantId: 10,
  tenantName: "Tenant A",
  connectorId: null,
  connectorGroupId: null,
  latestConfig: "route-policy BGP_BASELINE\nprefix-list RFC5735\ncommunity-filter WORLD\n",
  interfaceNames: ["Eth-Trunk1.1234", "Eth-Trunk2.200"],
  routePolicyNames: ["BGP_BASELINE"],
  interfaceStates: [{ name: "Eth-Trunk1.1234", adminStatus: "up" as const, operStatus: "up" as const, kind: "trunk" }],
};

const bgpInput = engine.normalizeConfigGeneratorInput({
  circuitId: "1234",
  customerName: "CLIENTE_X",
  localAsn: 273309,
  remoteAsn: 65001,
  interface: "Eth-Trunk1.1234",
  vlan: 1234,
  peerLocalIpv4: "10.0.0.1",
  peerRemoteIpv4: "10.0.0.2",
  peerLocalIpv6: "2001:db8::1",
  peerRemoteIpv6: "2001:db8::2",
  ipv4Prefixes: ["203.0.113.0/24"],
  ipv6Prefixes: ["2001:db8:100::/48"],
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
  normalizedInput: bgpInput,
  existingCircuitIds: [],
  existingCommunities: [],
  existingRoutePolicies: device.routePolicyNames,
});
assert.equal(bgpValidation.status, "warning");
assert.equal(bgpValidation.warnings.some((item) => item.code === "SECRET_NOT_PERSISTED"), true);

const bgpBlocks = engine.renderConfigGeneratorBlocks({
  templateKey: bgpTemplate.templateKey,
  templateContent: bgpTemplate.content,
  schemaJson: bgpTemplate.schemaJson,
  normalizedInput: bgpInput,
  device,
});
assert.match(bgpBlocks.blocks[0].content, /\[GLOBAL \/ já existente\]/);
assert.match(bgpBlocks.blocks[1].content, /\[CIRCUIT \/ novo\]/);
assert.match(bgpBlocks.blocks[2].content, /route-policy C1234_IMPORT permit node 10/);
assert.match(bgpBlocks.blocks[4].content, /peer 10\.0\.0\.2 route-policy C1234_IMPORT import/);
assert.equal(bgpBlocks.blocks[0].status, "missing");
assert.equal(bgpBlocks.blocks[4].status, "suggested");
assert.equal(bgpBlocks.blocks[5].status, "manual");
assert.equal(bgpBlocks.renderedConfig.includes("<SECRET_NOT_STORED>"), true);

const l2Input = engine.normalizeConfigGeneratorInput({
  circuitId: "5678",
  customerName: "CLIENTE_Y",
  deviceName: "PE-01",
  interface: "Eth-Trunk1.1234",
  vlan: 200,
  mode: "qinq",
  serviceType: "l2vpn_vlan",
  description: "L2VPN access",
  mtu: 1500,
  neighborSite: "SITE-B",
  endpointRole: "access",
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
  existingRoutePolicies: [],
});
assert.equal(l2Validation.status, "warning");

const l2Blocks = engine.renderConfigGeneratorBlocks({
  templateKey: l2Template.templateKey,
  templateContent: l2Template.content,
  schemaJson: l2Template.schemaJson,
  normalizedInput: l2Input,
  device,
});
assert.match(l2Blocks.blocks[0].content, /\[GLOBAL \/ ausente\]/);
assert.match(l2Blocks.blocks[1].content, /mode qinq/);
assert.match(l2Blocks.blocks[4].content, /encapsulation qinq 200/);
assert.match(l2Blocks.postcheckCommands, /display vlan 200/);
assert.match(l2Blocks.rollbackPlaceholder, /human review required/);

const secretSanitized = engine.sanitizeConfigGeneratorInputForStorage(bgpInput);
assert.equal((secretSanitized as { md5Secret?: string }).md5Secret, "<SECRET_NOT_STORED>");
assert.equal(secretSanitized.md5, "<SECRET_NOT_STORED>");

console.log("config-generator.template-refinement.selftest: OK");

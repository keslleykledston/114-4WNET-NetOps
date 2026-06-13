import assert from "node:assert/strict";

process.env["DATABASE_URL"] ??= "postgres://selftest:selftest@127.0.0.1:1/selftest";
process.env["CONFIG_GENERATOR_ENABLED"] ??= "false";
process.env["CONFIG_WRITE_ENABLED"] ??= "false";

const engine = await import("./config-generator.engine.js");
const catalog = await import("./config-generator.catalog.js");
const diffService = await import("./config-generator-diff.service.js");

const ptpTemplate = catalog.CONFIG_GENERATOR_TEMPLATES.find((item) => item.templateKey === catalog.L2VPN_PTP_TEMPLATE_KEY)!;
const vsiTemplate = catalog.CONFIG_GENERATOR_TEMPLATES.find((item) => item.templateKey === catalog.L2VPN_PTMP_TEMPLATE_KEY)!;

assert.ok(ptpTemplate, "PTP/L2VC template seed missing");
assert.ok(vsiTemplate, "PTMP/VSI template seed missing");
assert.equal(catalog.CONFIG_GENERATOR_TEMPLATES.length, 4);

const device = {
  deviceId: 1,
  hostname: "PE-01",
  vendor: "huawei",
  platform: "vrp",
  tenantId: 10,
  tenantName: "Tenant A",
  connectorId: null,
  connectorGroupId: null,
  latestConfig: [
    "mpls",
    "interface Eth-Trunk1",
    "interface Eth-Trunk1.650",
    "  mtu 1500",
    "mpls l2vc 650 650 remote 10.1.1.9",
    "vsi VSI_OLD 650",
    "  peer 10.1.1.9",
  ].join("\n"),
  interfaceNames: ["Eth-Trunk1", "Eth-Trunk1.650"],
  routePolicyNames: [],
  interfaceStates: [{ name: "Eth-Trunk1", adminStatus: "up" as const, operStatus: "up" as const, kind: "trunk" }],
};

const ptpInput = engine.normalizeConfigGeneratorInput({
  circuitId: "601",
  customerName: "CLIENTE_L2VC",
  localDeviceName: "PE-01",
  localInterface: "Eth-Trunk1",
  interface: "Eth-Trunk1.601",
  vlan: 601,
  subinterfaceId: 601,
  l2vcId: 601,
  remotePeerIp: "10.1.1.2",
  remoteSite: "SITE-B",
  remoteDeviceName: "PE-02",
  encapsulation: "dot1q",
  description: "L2VC preview",
  mtu: 1500,
  serviceType: "l2vpn_ptp",
});

const ptpBlocks = engine.renderConfigGeneratorBlocks({
  templateKey: ptpTemplate.templateKey,
  templateContent: ptpTemplate.content,
  schemaJson: ptpTemplate.schemaJson,
  normalizedInput: ptpInput,
  device,
});
assert.match(ptpBlocks.renderedConfig, /mpls l2vc 601/);
assert.match(ptpBlocks.renderedConfig, /display mpls l2vc/);
assert.match(ptpBlocks.rollbackPlaceholder, /do not remove global MPLS/);
assert.equal(ptpBlocks.blocks.some((block) => block.key === "l2vc_binding"), true);
assert.equal(ptpBlocks.blocks.some((block) => block.key === "interface_binding"), true);

const vsiInput = engine.normalizeConfigGeneratorInput({
  circuitId: "602",
  customerName: "CLIENTE_VSI",
  vsiName: "VSI_CLIENTE_X",
  vsiId: 602,
  vlan: 602,
  subinterfaceId: 602,
  accessInterface: "Eth-Trunk1.602",
  remotePeers: ["10.1.1.3", "10.1.1.4"],
  description: "VSI preview",
  mtu: 1500,
  serviceType: "l2vpn_ptmp",
});

const vsiBlocks = engine.renderConfigGeneratorBlocks({
  templateKey: vsiTemplate.templateKey,
  templateContent: vsiTemplate.content,
  schemaJson: vsiTemplate.schemaJson,
  normalizedInput: vsiInput,
  device,
});
assert.match(vsiBlocks.renderedConfig, /vsi VSI_CLIENTE_X 602/);
assert.match(vsiBlocks.renderedConfig, /display vsi name VSI_CLIENTE_X/);
assert.match(vsiBlocks.rollbackPlaceholder, /do not remove VSI if other peers remain/);
assert.equal(vsiBlocks.blocks.some((block) => block.key === "vsi_definition"), true);
assert.equal(vsiBlocks.blocks.some((block) => block.key === "access_binding"), true);

const freeIdsValidation = engine.validateConfigGeneratorInput({
  serviceType: ptpTemplate.serviceType,
  device,
  templateKey: ptpTemplate.templateKey,
  normalizedInput: ptpInput,
  existingCircuitIds: [],
  existingCommunities: [],
  existingVlans: [],
  existingL2vcIds: [650],
  existingVsiIds: [650],
  existingSubinterfaces: ["Eth-Trunk1.650"],
});
assert.equal(freeIdsValidation.errors.some((item) => item.code === "l2vc_conflict"), false);

const occupiedL2vc = engine.validateConfigGeneratorInput({
  serviceType: ptpTemplate.serviceType,
  device,
  templateKey: ptpTemplate.templateKey,
  normalizedInput: { ...ptpInput, l2vcId: 650 },
  existingCircuitIds: [],
  existingCommunities: [],
  existingVlans: [],
  existingL2vcIds: [650],
  existingSubinterfaces: [],
});
assert.equal(occupiedL2vc.errors.some((item) => item.code === "l2vc_conflict"), true);

const occupiedVsi = engine.validateConfigGeneratorInput({
  serviceType: vsiTemplate.serviceType,
  device,
  templateKey: vsiTemplate.templateKey,
  normalizedInput: { ...vsiInput, vsiId: 650 },
  existingCircuitIds: [],
  existingCommunities: [],
  existingVlans: [],
  existingVsiIds: [650],
  existingSubinterfaces: [],
});
assert.equal(occupiedVsi.errors.some((item) => item.code === "vsi_conflict"), true);

const occupiedSubif = engine.validateConfigGeneratorInput({
  serviceType: ptpTemplate.serviceType,
  device,
  templateKey: ptpTemplate.templateKey,
  normalizedInput: { ...ptpInput, interface: "Eth-Trunk1.650", vlan: 650, l2vcId: 651 },
  existingCircuitIds: [],
  existingCommunities: [],
  existingVlans: [],
  existingL2vcIds: [],
  existingSubinterfaces: ["Eth-Trunk1.650"],
});
assert.equal(occupiedSubif.errors.some((item) => item.code === "subinterface_conflict"), true);

const vlanOutsideRange = engine.validateConfigGeneratorInput({
  serviceType: ptpTemplate.serviceType,
  device,
  templateKey: ptpTemplate.templateKey,
  normalizedInput: { ...ptpInput, vlan: 850, l2vcId: 851, interface: "Eth-Trunk1.851" },
  existingCircuitIds: [],
  existingCommunities: [],
  existingVlans: [],
  existingL2vcIds: [],
  existingSubinterfaces: [],
});
assert.equal(vlanOutsideRange.warnings.some((item) => item.code === "vlan_outside_preferred_range"), true);

const ptpMultiPeer = engine.validateConfigGeneratorInput({
  serviceType: ptpTemplate.serviceType,
  device,
  templateKey: ptpTemplate.templateKey,
  normalizedInput: { ...ptpInput, remotePeers: ["10.1.1.2", "10.1.1.3"] },
  existingCircuitIds: [],
  existingCommunities: [],
  existingVlans: [],
  existingL2vcIds: [],
  existingSubinterfaces: [],
});
assert.equal(ptpMultiPeer.warnings.some((item) => item.code === "ptp_multiple_peers"), true);

const vsiNoPeers = engine.validateConfigGeneratorInput({
  serviceType: vsiTemplate.serviceType,
  device,
  templateKey: vsiTemplate.templateKey,
  normalizedInput: { ...vsiInput, remotePeers: [] },
  existingCircuitIds: [],
  existingCommunities: [],
  existingVlans: [],
  existingVsiIds: [],
  existingSubinterfaces: [],
});
assert.equal(vsiNoPeers.errors.some((item) => item.code === "missing_remote_peers"), true);

const vsiSinglePeer = engine.validateConfigGeneratorInput({
  serviceType: vsiTemplate.serviceType,
  device,
  templateKey: vsiTemplate.templateKey,
  normalizedInput: { ...vsiInput, remotePeers: ["10.1.1.3"] },
  existingCircuitIds: [],
  existingCommunities: [],
  existingVlans: [],
  existingVsiIds: [],
  existingSubinterfaces: [],
});
assert.equal(vsiSinglePeer.warnings.some((item) => item.code === "ptmp_single_peer"), true);

const baseline = {
  source: "collected_configs" as const,
  rawConfig: device.latestConfig,
  collectedAt: "2026-01-01T00:00:00.000Z",
  lines: device.latestConfig.split("\n").map((line) => line.trim()).filter(Boolean),
  checksum: "baseline",
  semantic: {
    routePolicies: new Map(),
    prefixLists: new Map(),
    communityFilters: new Map(),
    asPathFilters: new Set<string>(),
    interfaces: new Map([["eth-trunk1", "Eth-Trunk1"], ["eth-trunk1.650", "Eth-Trunk1.650"]]),
    vlans: new Map([[650, "650"]]),
    peers: new Map(),
    bgpLocalAsn: null,
    l2vcs: new Map([[650, { peerIp: "10.1.1.9", interfaceName: "Eth-Trunk1.650" }]]),
    vsis: new Map([["vsi_old", { vsiId: 650, peers: ["10.1.1.9"] }]]),
    subinterfaces: new Map([["eth-trunk1.650", "Eth-Trunk1.650"]]),
  },
};

const l2vcPeerConflictPreview = {
  ...ptpBlocks,
  blocks: ptpBlocks.blocks.map((block) => block.key === "l2vc_binding"
    ? { ...block, content: "mpls l2vc 650 650 remote 10.1.1.2" }
    : block),
};
const l2vcDiff = diffService.buildConfigGeneratorDiffFromPreview(l2vcPeerConflictPreview, baseline);
assert.equal(l2vcDiff.diffBlocks.some((block) => block.items.some((item) => item.status === "conflict" && item.details?.includes("L2VC peer"))), true);

const vsiDiffPreview = {
  ...vsiBlocks,
  blocks: vsiBlocks.blocks.map((block) => block.key === "vsi_definition"
    ? { ...block, content: "vsi VSI_OLD 650\n  peer 10.1.1.99" }
    : block),
};
const vsiDiff = diffService.buildConfigGeneratorDiffFromPreview(vsiDiffPreview, baseline);
assert.equal(vsiDiff.diffBlocks.some((block) => block.items.some((item) => (item.status === "partial_match" || item.status === "already_present") && (item.details?.includes("VSI exists") || item.line.toLowerCase().includes("vsi vsi_old")))), true);

const changePreview = await import("./config-generator-change-request-preview.service.js");
const risk = changePreview.assessRisk({
  validation: { status: "failed", warnings: [], errors: [{ severity: "error", code: "l2vc_conflict", message: "L2VC ID 650 já ocupado no tenant." }] },
  diff: null,
  idConflicts: [],
  baselineMissing: false,
});
assert.equal(risk.riskLevel, "high");

assert.equal(process.env.CONFIG_WRITE_ENABLED, "false");
assert.equal(catalog.CONFIG_GENERATOR_REASONS.writeBlocked.includes("preview"), true);

console.log("config-generator.l2vpn-templates.selftest OK");

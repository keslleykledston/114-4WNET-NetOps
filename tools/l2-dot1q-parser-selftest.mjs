#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/l2circuits/__fixtures__/manual-device-1",
);
const parserDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/parsers");

const fixtures = {
  configInterface: readFileSync(path.join(fixturesDir, "display_current_config_interface.txt"), "utf8"),
  interfaceDescription: readFileSync(path.join(fixturesDir, "display_interface_description.txt"), "utf8"),
  l2vcVerbose: readFileSync(path.join(parserDir, "__fixtures__/display-mpls-l2vc-verbose.txt"), "utf8"),
  vsiVerbose: readFileSync(path.join(parserDir, "__fixtures__/display-vsi-verbose.txt"), "utf8"),
};

const code = `
import assert from "node:assert/strict";
import { parseHuaweiL2Circuits } from ${JSON.stringify(pathToFileURL(path.join(parserDir, "huawei-vrp-l2.ts")).href)};
import { normalizeCircuits } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/normalizers/status.normalizer.ts")).href)};
import { resolveL2Findings } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/normalizers/findings.resolver.ts")).href)};

const fixtures = ${JSON.stringify(fixtures)};

const manual = parseHuaweiL2Circuits({
  "display current-configuration interface": fixtures.configInterface,
  "display interface description": fixtures.interfaceDescription,
});

assert.ok(manual.length > 0, "manual device 1 must produce circuits");
assert.ok(manual.length >= 120 && manual.length <= 140, \`expected ~131 circuits, got \${manual.length}\`);
assert.equal(manual.some((c) => c.circuitType === "vpws"), false, "dot1q/config-only circuits must not become VPWS");

const eth770 = manual.find((c) => c.localInterface === "Eth-Trunk0.77");
assert.ok(eth770, "Eth-Trunk0.77 must exist");
assert.equal(eth770.outerVlan, 77);
assert.equal(eth770.parentInterface, "Eth-Trunk0");
assert.equal(eth770.description, "EN-4WNET-BVA-CDS-RX_M4");
assert.equal(eth770.serviceId, "Eth-Trunk0.77:vlan-77");
assert.equal(eth770.classification, "l3_interface");
assert.equal(eth770.l2Transport, "l3");
assert.equal(eth770.circuitType, "l3_interface");

const ve100 = manual.find((c) => c.localInterface === "Virtual-Ethernet0/2/21.100");
assert.ok(ve100, "Virtual-Ethernet VE circuit must exist");
assert.equal(ve100.outerVlan, 100);
assert.match(String(ve100.description), /EN-NETFAST-BVA-BRT-VSI/);
assert.match(String(ve100.description), /ve-group 2 l3-access/);
assert.notEqual(ve100.circuitType, "vpws");
assert.ok(ve100.evidenceFlags?.hasBridge);

const normalized = normalizeCircuits(manual);
const downCircuit = normalized.find((c) => c.localInterface === "Eth-Trunk0.894");
assert.ok(downCircuit, "Eth-Trunk0.894 down circuit must exist");
assert.equal(downCircuit.operStatus, "DOWN");

const findings = resolveL2Findings(normalized);
assert.ok(findings.some((f) => f.code === "CIRCUIT_DOWN"), "must emit CIRCUIT_DOWN for oper down");
assert.equal(
  findings.some((f) => f.code === "INCOMPLETE_L2_CONFIG"),
  false,
  "vlan_local batch must not trigger INCOMPLETE_L2_CONFIG",
);
assert.ok(findings.some((f) => f.code === "ROUTER_L2_VLAN_ANOMALY"), "router local VLAN constructs must be tagged");

const l2vcOnly = parseHuaweiL2Circuits({
  "display mpls l2vc verbose": fixtures.l2vcVerbose,
  "display vsi verbose": fixtures.vsiVerbose,
});
assert.equal(l2vcOnly.length, 6, "L2VC/VSI regression must stay at 6 circuits");
assert.equal(l2vcOnly.filter((c) => c.circuitType === "l2vc" || c.circuitType === "vpws").length, 3);
assert.equal(l2vcOnly.filter((c) => c.circuitType === "vsi").length, 3);

console.log(JSON.stringify({
  manualCount: manual.length,
  vlanLocalCount: manual.filter((c) => c.circuitType === "vlan_local").length,
  vlanOrphanCount: manual.filter((c) => c.circuitType === "vlan_orphan").length,
  l3Count: manual.filter((c) => c.l2Transport === "l3").length,
  vpwsCount: manual.filter((c) => c.circuitType === "vpws").length,
  l2vcRegressionCount: l2vcOnly.length,
  sample: manual.slice(0, 3).map((c) => ({
    circuitType: c.circuitType,
    serviceId: c.serviceId,
    localInterface: c.localInterface,
    outerVlan: c.outerVlan,
    description: c.description,
    adminStatus: c.adminStatus,
    operStatus: c.operStatus,
  })),
}, null, 2));
`;

const result = spawnSync("pnpm", ["dlx", "tsx", "-e", code], {
  cwd: rootDir,
  encoding: "utf8",
  env: process.env,
});

if (result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

console.log(result.stdout);
console.log("l2-dot1q-parser-selftest: OK");

#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parserDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/parsers");
const normalizerDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/normalizers");

const code = `
import assert from "node:assert/strict";
import { parseHuaweiL2Circuits } from ${JSON.stringify(pathToFileURL(path.join(parserDir, "huawei-vrp-l2.ts")).href)};
import { normalizeCircuits } from ${JSON.stringify(pathToFileURL(path.join(normalizerDir, "status.normalizer.ts")).href)};
import { enrichCircuitsWithFindings, attachFindingsToCircuits } from ${JSON.stringify(pathToFileURL(path.join(normalizerDir, "findings.resolver.ts")).href)};
import { buildCircuitKey } from ${JSON.stringify(pathToFileURL(path.join(normalizerDir, "circuit-key.helpers.ts")).href)};

const config = [
  "interface Eth-Trunk1.89",
  " vlan-type dot1q 89",
  " description SVC-89",
  "#",
  "interface Eth-Trunk1.891",
  " vlan-type dot1q 891",
  "#",
  "interface Eth-Trunk1.893",
  " vlan-type dot1q 893",
  "#",
].join("\\n");

const parsed = parseHuaweiL2Circuits({
  "display current-configuration interface": config,
  "display interface description": [
    "Interface                   PHY   Protocol Description",
    "Eth-Trunk1.89               up    down",
    "Eth-Trunk1.891              up    down",
    "Eth-Trunk1.893              up    down",
  ].join("\\n"),
});

const normalized = normalizeCircuits(parsed);
const enriched = enrichCircuitsWithFindings(normalized, 1);

const c89 = enriched.find((c) => c.localInterface === "Eth-Trunk1.89");
const c891 = enriched.find((c) => c.localInterface === "Eth-Trunk1.891");
const c893 = enriched.find((c) => c.localInterface === "Eth-Trunk1.893");

assert.ok(c89, "Eth-Trunk1.89 must exist");
assert.ok(c891, "Eth-Trunk1.891 must exist");
assert.ok(c893, "Eth-Trunk1.893 must exist");

assert.equal(c89.circuitType, "vlan_local", "89 with description stays vlan_local");
assert.equal(c891.circuitType, "vlan_orphan", "891 dot1q-only is vlan_orphan");
assert.equal(c893.circuitType, "vlan_orphan", "893 dot1q-only is vlan_orphan");

assert.ok(c891.findings.some((f) => f.code === "VLAN_ORPHAN"), "891 must have VLAN_ORPHAN");
assert.ok(c893.findings.some((f) => f.code === "VLAN_ORPHAN"), "893 must have VLAN_ORPHAN");
assert.equal(c89.findings.some((f) => f.code === "VLAN_ORPHAN"), false, "89 must not be orphan");

function messageRefersToInterface(message, iface) {
  const escaped = iface.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
  return new RegExp("(^|[^0-9])" + escaped + "([^0-9]|$)").test(message);
}

for (const finding of c89.findings) {
  assert.equal(messageRefersToInterface(finding.message, "Eth-Trunk1.891"), false, "89 must not inherit 891 findings");
  assert.equal(messageRefersToInterface(finding.message, "Eth-Trunk1.893"), false, "89 must not inherit 893 findings");
}

for (const finding of c891.findings) {
  assert.equal(messageRefersToInterface(finding.message, "Eth-Trunk1.89"), false, "891 must not inherit 89 findings");
  assert.ok(messageRefersToInterface(finding.message, "Eth-Trunk1.891") || finding.code === "ROUTER_L2_VLAN_ANOMALY", "891 finding must belong to 891");
}

for (const finding of c893.findings) {
  assert.equal(messageRefersToInterface(finding.message, "Eth-Trunk1.89"), false, "893 must not inherit 89 findings");
}

const key89 = buildCircuitKey(c89, 1);
const key891 = buildCircuitKey(c891, 1);
assert.notEqual(key89, key891, "distinct interfaces must have distinct keys");
assert.notEqual(key89, buildCircuitKey(c893, 1));

// Legacy attach path must not broaden findings via substring match
const legacy = attachFindingsToCircuits(normalized, [], 1);
const legacy89 = legacy.find((c) => c.localInterface === "Eth-Trunk1.89");
assert.equal(legacy89.findings.some((f) => messageRefersToInterface(f.message, "Eth-Trunk1.891")), false);

console.log(JSON.stringify({
  ok: true,
  counts: {
    c89: c89.findings.length,
    c891: c891.findings.length,
    c893: c893.findings.length,
  },
  types: {
    c89: c89.circuitType,
    c891: c891.circuitType,
    c893: c893.circuitType,
  },
}));
`;

const result = spawnSync("pnpm", ["dlx", "tsx", "-e", code], {
  cwd: rootDir,
  encoding: "utf8",
  env: process.env,
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

console.log(result.stdout.trim());
console.log("l2-findings-interface-match-selftest: PASS");

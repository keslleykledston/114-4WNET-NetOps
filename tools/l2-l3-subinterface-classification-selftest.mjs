#!/usr/bin/env node
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
import { enrichCircuitsWithFindings } from ${JSON.stringify(pathToFileURL(path.join(normalizerDir, "findings.resolver.ts")).href)};

function enrich(config, desc) {
  const parsed = parseHuaweiL2Circuits({
    "display current-configuration interface": config,
    "display interface description": desc ?? "Interface                   PHY   Protocol Description",
  });
  return enrichCircuitsWithFindings(normalizeCircuits(parsed), 1);
}

function assertFlags(circuit, expected) {
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(Boolean(circuit.evidenceFlags?.[key]), value, \`\${circuit.localInterface} flag \${key}\`);
  }
}

function assertFindingCodes(circuit, codes) {
  const actual = circuit.findings.map((f) => f.code).sort();
  assert.deepEqual(actual, [...codes].sort(), \`\${circuit.localInterface} findings\`);
}

// Caso A — L3 IPv4
const caseA = enrich([
  "interface Eth-Trunk1.93",
  " vlan-type dot1q 93",
  " ip address 10.20.0.1 255.255.255.252",
  " statistic enable",
  "#",
].join("\\n"));
const a = caseA.find((c) => c.localInterface === "Eth-Trunk1.93");
assert.ok(a);
assert.equal(a.outerVlan, 93);
assert.equal(a.classification, "l3_interface");
assert.equal(a.circuitType, "l3_interface");
assertFlags(a, { hasDot1q: true, hasIpv4: true, hasStatisticEnable: true });
assert.equal(a.findings.some((f) => f.code === "VLAN_ORPHAN"), false);
assert.ok(a.findings.some((f) => f.code === "DESCRIPTION_MISSING"));

// Caso B — L3 IPv4/IPv6/OSPF
const caseB = enrich([
  "interface Eth-Trunk2.152",
  " vlan-type dot1q 152",
  " mtu 9216",
  " ipv6 enable",
  " ip address 10.20.0.57 255.255.255.252",
  " ipv6 address 2804:5984:B000:1::9D/126",
  " statistic enable",
  " ospf network-type p2p",
  "#",
].join("\\n"));
const b = caseB.find((c) => c.localInterface === "Eth-Trunk2.152");
assert.ok(b);
assert.equal(b.classification, "l3_interface");
assertFlags(b, { hasDot1q: true, hasIpv4: true, hasIpv6: true, hasIpv6Enable: true, hasOspf: true, hasMtu: true, hasStatisticEnable: true });
assert.equal(b.findings.some((f) => f.code === "VLAN_ORPHAN"), false);
assert.ok(b.findings.some((f) => f.code === "DESCRIPTION_MISSING"));
const roleB = JSON.parse(String(b.roleContext));
assert.equal(roleB.service_family, "l3");
assert.equal(roleB.ospf, true);
assert.equal(roleB.ipv6, true);

// Caso C — VLAN órfã real
const caseC = enrich([
  "interface Eth-Trunk1.891",
  " vlan-type dot1q 891",
  "#",
].join("\\n"));
const c = caseC.find((c) => c.localInterface === "Eth-Trunk1.891");
assert.ok(c);
assert.equal(c.classification, "vlan_orphan");
assertFlags(c, { hasDot1q: true, hasIpv4: false, hasIpv6: false, hasOspf: false });
assert.ok(c.findings.some((f) => f.code === "VLAN_ORPHAN"));

// Caso D — match exato por interface
const caseD = enrich([
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
].join("\\n"));
const d89 = caseD.find((c) => c.localInterface === "Eth-Trunk1.89");
const d891 = caseD.find((c) => c.localInterface === "Eth-Trunk1.891");
const d893 = caseD.find((c) => c.localInterface === "Eth-Trunk1.893");
assert.equal(d89.classification, "vlan_local");
assert.equal(d891.classification, "vlan_orphan");
for (const finding of d89.findings) {
  assert.equal(finding.message.includes("Eth-Trunk1.891") && !finding.message.includes("Eth-Trunk1.89 "), false);
}
assert.equal(d891.findings.some((f) => f.code === "VLAN_ORPHAN"), true);

console.log(JSON.stringify({ ok: true, cases: { A: a.classification, B: b.classification, C: c.classification, D89: d89.classification } }));
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

console.log(result.stdout.trim());
console.log("l2-l3-subinterface-classification-selftest: PASS");

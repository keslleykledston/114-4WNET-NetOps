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

function enrich(config) {
  const parsed = parseHuaweiL2Circuits({
    "display current-configuration interface": config,
    "display interface description": "Interface                   PHY   Protocol Description",
  });
  return enrichCircuitsWithFindings(normalizeCircuits(parsed), 1);
}

// Multi-interface VLAN must not emit VLAN_ORPHAN
const multi = enrich([
  "interface Eth-Trunk1.200",
  " vlan-type dot1q 200",
  "#",
  "interface Eth-Trunk2.200",
  " vlan-type dot1q 200",
  "#",
].join("\\n"));
assert.equal(multi.every((c) => c.classification === "vlan_local"), true);
assert.equal(multi.some((c) => c.findings.some((f) => f.code === "VLAN_ORPHAN")), false);
assert.ok(multi.some((c) => c.findings.some((f) => f.code === "VLAN_MULTI_INTERFACE_LOCAL")));

// Vlanif-only without service → VLANIF_ORPHAN, not VLAN_ORPHAN
const vlanif = enrich([
  "# hostname=EDGE_S6730",
  "vlan batch 300",
  "interface Vlanif300",
  " description unused",
  "#",
].join("\\n"));
const v300 = vlanif.find((c) => c.localInterface === "Vlanif300");
assert.ok(v300);
assert.equal(v300.classification, "vlanif_orphan");
assert.equal(v300.findings.some((f) => f.code === "VLAN_ORPHAN"), false);
assert.ok(v300.findings.some((f) => f.code === "VLANIF_ORPHAN"));

// Misclassified vlanif stored as vlan_orphan must still surface VLANIF_ORPHAN
const misclassified = enrichCircuitsWithFindings([
  {
    circuitType: "vlan_orphan",
    classification: "vlan_orphan",
    name: "Vlanif400",
    localInterface: "Vlanif400",
    outerVlan: 400,
    adminStatus: "UNKNOWN",
    operStatus: "CONFIG_ONLY",
    l2Transport: "none",
    deviceRoleFamily: "SWITCH",
    evidenceFlags: { hasVlanif: true },
    rawEvidence: "",
    findings: [],
  },
], 1);
assert.equal(misclassified[0].findings.some((f) => f.code === "VLAN_ORPHAN"), false);
assert.ok(misclassified[0].findings.some((f) => f.code === "VLANIF_ORPHAN"));

console.log(JSON.stringify({ ok: true }));
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
console.log("l2-vlan-orphan-findings-selftest: PASS");

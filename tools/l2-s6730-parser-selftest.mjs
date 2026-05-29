#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/l2circuits/__fixtures__/manual-s6730-brt-a",
);
const parserDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/parsers");
const device1Dir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/__fixtures__/manual-device-1");

const fixtures = {
  l2vc: readFileSync(path.join(fixturesDir, "display_mpls_l2vc.txt"), "utf8"),
  vsi: readFileSync(path.join(fixturesDir, "display_vsi_verbose.txt"), "utf8"),
  neL2vc: readFileSync(path.join(parserDir, "__fixtures__/display-mpls-l2vc-verbose.txt"), "utf8"),
  neVsi: readFileSync(path.join(parserDir, "__fixtures__/display-vsi-verbose.txt"), "utf8"),
  device1Config: readFileSync(path.join(device1Dir, "display_current_config_interface.txt"), "utf8"),
  device1Desc: readFileSync(path.join(device1Dir, "display_interface_description.txt"), "utf8"),
};

const code = `
import assert from "node:assert/strict";
import { parseHuaweiL2Circuits } from ${JSON.stringify(pathToFileURL(path.join(parserDir, "huawei-vrp-l2.ts")).href)};
import { parseS6730L2vcSummary } from ${JSON.stringify(pathToFileURL(path.join(parserDir, "s6730-l2.parser.ts")).href)};
import { normalizeCircuits } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/normalizers/status.normalizer.ts")).href)};
import { resolveL2Findings } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/normalizers/findings.resolver.ts")).href)};

const fixtures = ${JSON.stringify(fixtures)};

const s6730 = parseHuaweiL2Circuits({
  "display mpls l2vc": fixtures.l2vc,
  "display vsi verbose": fixtures.vsi,
});

const summary = parseS6730L2vcSummary(fixtures.l2vc);
assert.equal(summary.total, 82, "header must report 82 total VCs");
assert.equal(summary.up, 63);
assert.equal(summary.down, 19);

const l2vcs = s6730.filter((c) => c.circuitType === "l2vc" || c.circuitType === "vpws");
assert.ok(l2vcs.length > 0, "must parse at least one L2VC from manual fixture");

if (l2vcs.length >= 80) {
  const normalized = normalizeCircuits(l2vcs);
  const up = normalized.filter((c) => c.operStatus === "UP").length;
  const down = normalized.filter((c) => c.operStatus === "DOWN").length;
  assert.equal(l2vcs.length, 82);
  assert.equal(up, 63);
  assert.equal(down, 19);
} else {
  assert.equal(l2vcs.length, 1, "partial manual fixture has one VC block");
}

const vc15 = l2vcs.find((c) => c.vcId === "15");
assert.ok(vc15, "VC 15 must exist");
assert.equal(vc15.localInterface, "Vlanif15");
assert.equal(vc15.peerIp, "10.200.5.1");
assert.equal(vc15.circuitType, "vpws");
assert.equal(vc15.classification, "vpws");
assert.equal(vc15.l2Transport, "pseudowire");
assert.equal(vc15.outerVlan, 15);
assert.equal(vc15.remoteForwardingState, "not forwarding");
assert.equal(vc15.acStatus, "up");
assert.equal(vc15.operStatus, "down");

const vc15Norm = normalizeCircuits([vc15])[0];
assert.equal(vc15Norm.operStatus, "DOWN");
const vc15Findings = resolveL2Findings([vc15Norm]);
assert.ok(vc15Findings.some((f) => f.code === "CIRCUIT_DOWN"));
assert.ok(vc15Findings.some((f) => f.code === "REMOTE_NOT_FORWARDING"));
assert.equal(vc15Findings.some((f) => f.code === "DESCRIPTION_MISSING"), false);

const vsi = s6730.find((c) => c.vsiName === "SERVICOS_CDS");
assert.ok(vsi, "SERVICOS_CDS VSI must exist");
assert.equal(vsi.vsiId, "601");
assert.equal(vsi.peerIp, "10.200.4.1");
assert.equal(vsi.circuitType, "vsi");
assert.equal(vsi.classification, "vsi");
assert.equal(vsi.l2Transport, "multipoint");
assert.equal(vsi.operStatus, "UP");
assert.equal(vsi.peers?.length, 1);

const ne = parseHuaweiL2Circuits({
  "display mpls l2vc verbose": fixtures.neL2vc,
  "display vsi verbose": fixtures.neVsi,
});
assert.equal(ne.length, 6, "NE8000 regression must stay at 6 circuits");

const dot1q = parseHuaweiL2Circuits({
  "display current-configuration interface": fixtures.device1Config,
  "display interface description": fixtures.device1Desc,
});
assert.equal(dot1q.length, 131, "device 1 dot1q regression must stay at 131");
assert.equal(dot1q.some((c) => c.circuitType === "vpws"), false, "device 1 dot1q/VE must not become VPWS");

console.log(JSON.stringify({
  summary,
  parsedL2vc: l2vcs.length,
  vc15: {
    vcId: vc15.vcId,
    localInterface: vc15.localInterface,
    peerIp: vc15.peerIp,
    operStatus: vc15Norm.operStatus,
    remoteForwardingState: vc15.remoteForwardingState,
    findings: vc15Findings.map((f) => f.code),
  },
  vsi: {
    vsiName: vsi.vsiName,
    vsiId: vsi.vsiId,
    peerIp: vsi.peerIp,
  },
  neRegression: ne.length,
  dot1qRegression: dot1q.length,
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
console.log("l2-s6730-parser-selftest: OK");

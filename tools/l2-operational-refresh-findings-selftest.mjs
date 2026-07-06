#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mergeDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/operational-refresh");
const normalizerDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/normalizers");

const code = `
import assert from "node:assert/strict";
import {
  applyLiveOpsToCircuit,
  applyParsedConfigToCircuit,
  buildConfigCircuitKeys,
  buildLiveOpsByKey,
  shouldMarkOperationalStale,
  stripOperationalStaleTag,
  OPERATIONAL_STALE_TAG,
} from ${JSON.stringify(pathToFileURL(path.join(mergeDir, "l2-operational-merge.ts")).href)};
import { buildCircuitKey } from ${JSON.stringify(pathToFileURL(path.join(normalizerDir, "circuit-key.helpers.ts")).href)};
import { enrichCircuitsWithFindings } from ${JSON.stringify(pathToFileURL(path.join(normalizerDir, "findings.resolver.ts")).href)};

assert.deepEqual(
  stripOperationalStaleTag(["ROUTER_L2_VLAN_ANOMALY", OPERATIONAL_STALE_TAG]),
  ["ROUTER_L2_VLAN_ANOMALY"],
);

const recovered = {
  circuitType: "l2vc",
  classification: "l2vc",
  name: "svc-100",
  localInterface: "GE0/0/1.100",
  outerVlan: 100,
  vcId: "100",
  peerIp: "10.0.0.2",
  adminStatus: "UP",
  operStatus: "DOWN",
  pwStatus: "DOWN",
  remoteForwardingState: "not forwarding",
  sessionState: "down",
  l2Transport: "p2p",
  rawEvidence: "",
  findings: [],
};

const liveParsed = [{
  circuitType: "l2vc",
  classification: "l2vc",
  name: "svc-100",
  localInterface: "GE0/0/1.100",
  outerVlan: 100,
  vcId: "100",
  peerIp: "10.0.0.2",
  adminStatus: "UP",
  operStatus: "UP",
  pwStatus: "UP",
  remoteForwardingState: "forwarding",
  sessionState: "up",
  l2Transport: "p2p",
  rawEvidence: "",
}];

const liveByKey = buildLiveOpsByKey(liveParsed, 1);
assert.equal(applyLiveOpsToCircuit(recovered, liveByKey, 1), true);
assert.equal(recovered.operStatus, "UP");
assert.equal(recovered.pwStatus, "UP");
assert.equal(recovered.remoteForwardingState, "forwarding");
assert.equal(recovered.sessionState, "up");

const [enriched] = enrichCircuitsWithFindings([recovered], 1);
assert.equal(enriched.findings.some((f) => f.code === "CIRCUIT_DOWN"), false);
assert.equal(enriched.findings.some((f) => f.code === "L2VC_DOWN"), false);
assert.equal(enriched.findings.some((f) => f.code === "REMOTE_NOT_FORWARDING"), false);

const orphan = {
  circuitType: "vlan_orphan",
  classification: "vlan_orphan",
  name: "GE0/0/1.100",
  localInterface: "GE0/0/1.100",
  outerVlan: 100,
  adminStatus: "UP",
  operStatus: "UP",
  l2Transport: "none",
  rawEvidence: "",
  findings: [],
};

const parsedLocal = [{
  circuitType: "vlan_local",
  classification: "vlan_local",
  name: "GE0/0/1.100",
  localInterface: "GE0/0/1.100",
  outerVlan: 100,
  adminStatus: "UP",
  operStatus: "UP",
  l2Transport: "p2p",
  rawEvidence: "",
}];

const localByKey = buildLiveOpsByKey(parsedLocal, 1);
assert.equal(applyParsedConfigToCircuit(orphan, localByKey, 1), true);
assert.equal(orphan.classification, "vlan_local");
const [orphanEnriched] = enrichCircuitsWithFindings([orphan], 1);
assert.equal(orphanEnriched.findings.some((f) => f.code === "VLAN_ORPHAN"), false);

const configKeys = buildConfigCircuitKeys(parsedLocal, 1);
const orphanKey = buildCircuitKey(orphan, 1);
assert.equal(
  shouldMarkOperationalStale({
    snmpCollected: false,
    sshOpsCollected: true,
    snmpMatched: false,
    liveMatched: false,
    localInterface: orphan.localInterface,
    circuitType: "vlan_orphan",
    circuitKey: orphanKey,
    liveKeys: new Set(),
    configParsed: true,
    configKeys,
  }),
  false,
);
assert.equal(
  shouldMarkOperationalStale({
    snmpCollected: false,
    sshOpsCollected: true,
    snmpMatched: false,
    liveMatched: false,
    localInterface: "GE0/0/1.999",
    circuitType: "vlan_orphan",
    circuitKey: buildCircuitKey({ circuitType: "vlan_orphan", localInterface: "GE0/0/1.999", outerVlan: 999 }, 1),
    liveKeys: new Set(),
    configParsed: true,
    configKeys,
  }),
  true,
);

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
console.log("l2-operational-refresh-findings-selftest: PASS");

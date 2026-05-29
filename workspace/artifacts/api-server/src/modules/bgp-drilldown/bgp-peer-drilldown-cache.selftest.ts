import assert from "node:assert/strict";
import type { BgpPeerDrilldownResult } from "./bgp-peer-drilldown.types.js";

process.env["DATABASE_URL"] ??= "postgres://selftest:selftest@127.0.0.1:1/selftest";

const {
  buildBgpPeerDrilldownSnapshotInsert,
  computeBgpPeerDrilldownHash,
} = await import("./bgp-peer-drilldown-cache.js");

const sample: BgpPeerDrilldownResult = {
  contractVersion: "bgp-peer-drilldown-v1",
  deviceId: 1,
  peer: "172.28.1.138",
  source: "ssh_full_config",
  collectedAt: "2026-05-26T00:00:00.000Z",
  configBuildSource: "raw_config",
  snapshotId: 7,
  root: {
    peer: "172.28.1.138",
    asNumber: 262663,
    description: "WIFIZAO.BRT",
    group: null,
    connectInterface: null,
    timers: null,
    passwordPresent: false,
    source: "ssh_full_config",
    status: "FOUND",
  },
  families: [],
  effectivePolicies: [],
  policies: [],
  dependencies: [],
  runtime: null,
  routeTables: {
    received: { requested: false, available: false, prefixCount: null },
    accepted: { requested: false, available: false, prefixCount: null },
    advertised: { requested: false, available: false, prefixCount: null },
  },
  warnings: ["catalog absent"],
  rawEvidenceRefs: [],
};

const hashA = computeBgpPeerDrilldownHash(sample);
const hashB = computeBgpPeerDrilldownHash({ ...sample });
assert.equal(hashA, hashB);
assert.match(hashA, /^[a-f0-9]{64}$/);

const insert = buildBgpPeerDrilldownSnapshotInsert(sample, 60);
assert.equal(insert.deviceId, 1);
assert.equal(insert.peer, "172.28.1.138");
assert.equal(insert.source, "snapshot");
assert.equal(insert.configBuildSource, "raw_config");
assert.equal(insert.peerHash, hashA);
assert.deepEqual(insert.warnings, ["catalog absent"]);
assert.equal(insert.runtimeJson, null);
assert.ok(insert.expiresAt.getTime() > Date.now());
assert.equal((insert.snapshotJson as BgpPeerDrilldownResult).routeTables.received.requested, false);

console.log("BGP drilldown D5 cache selftest PASS");

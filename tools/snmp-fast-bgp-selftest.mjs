#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { BGP_MIB_COLLECTOR_ORDER } = await import(
  path.join(root, "workspace/artifacts/api-server/src/modules/operational-bgp/operational-bgp.types.ts")
);
const { collectBgpPeers, RFC4273_BGP_PEER_TABLE_BASE } = await import(
  path.join(root, "workspace/artifacts/api-server/src/modules/operational-bgp/operational-bgp.collector.ts")
);
const { isNetopsSnmpBgpRealEnabled } = await import(
  path.join(root, "workspace/artifacts/api-server/src/modules/operational-bgp/operational-bgp.gate.ts")
);
const { computeBgpFreshnessStatus } = await import(
  path.join(root, "workspace/artifacts/api-server/src/modules/operational-bgp/operational-bgp.freshness.ts")
);
const { SNMP_FAST_BGP_DISABLED, SnmpFastBgpDisabledError } = await import(
  path.join(root, "workspace/artifacts/api-server/src/modules/operational-bgp/operational-bgp.errors.ts")
);

assert.deepEqual(BGP_MIB_COLLECTOR_ORDER, ["rfc4273", "bgp4v2", "huawei"]);
assert.equal(RFC4273_BGP_PEER_TABLE_BASE, "1.3.6.1.2.1.15.2.1");

process.env.NETOPS_SNMP_BGP_REAL_ENABLED = "false";
assert.equal(isNetopsSnmpBgpRealEnabled(), false);

const err = new SnmpFastBgpDisabledError();
assert.equal(err.code, SNMP_FAST_BGP_DISABLED);
assert.equal(err.statusCode, 503);
assert.ok(!JSON.stringify(err).toLowerCase().includes("community"));

const collected = await collectBgpPeers({ deviceId: 1, host: "127.0.0.1", community: "x" });
assert.equal(collected.peers.length, 0);
assert.equal(collected.stub, true);
assert.equal(collected.collectorUsed, null);
assert.ok(collected.warnings.some((w) => w.includes("stub")));

const now = new Date("2026-05-27T12:00:00Z");
assert.equal(computeBgpFreshnessStatus(new Date(now.getTime() - 5 * 60 * 1000), now), "fresh");
assert.equal(computeBgpFreshnessStatus(new Date(now.getTime() - 2 * 60 * 60 * 1000), now), "stale");
assert.equal(computeBgpFreshnessStatus(new Date(now.getTime() - 30 * 60 * 60 * 1000), now), "expired");
assert.equal(computeBgpFreshnessStatus(null, now), "unknown");

console.log("snmp-fast-bgp-selftest: PASS");

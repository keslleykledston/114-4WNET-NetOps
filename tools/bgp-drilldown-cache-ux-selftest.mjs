#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { parseDrilldownQueryParams } = await import(
  path.join(root, "workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown-query.ts")
);

assert.deepEqual(parseDrilldownQueryParams({ source: "snapshot", force_recompute: "true" }), {
  source: "snapshot",
  includePolicies: true,
  includePolicyObjects: true,
  snapshotId: undefined,
  jobId: undefined,
  forceRecompute: true,
});
assert.equal(parseDrilldownQueryParams({ source: "snapshot" }).forceRecompute, false);

console.log("bgp-drilldown-cache-ux-selftest: OK (force_recompute parsed, no network)");

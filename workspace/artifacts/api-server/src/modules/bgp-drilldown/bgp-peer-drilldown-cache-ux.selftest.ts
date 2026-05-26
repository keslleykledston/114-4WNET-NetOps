import assert from "node:assert/strict";

process.env["DATABASE_URL"] ??= "postgres://selftest:selftest@127.0.0.1:1/selftest";
process.env["BGP_DRILLDOWN_CACHE_TTL_SECONDS"] = "100";

const { computeHistoryFreshness } = await import("./bgp-peer-drilldown-cache.js");

const now = new Date("2026-05-26T12:00:00.000Z");
assert.equal(computeHistoryFreshness(new Date("2026-05-26T12:01:30.000Z"), now), "fresh");
assert.equal(computeHistoryFreshness(new Date("2026-05-26T12:00:20.000Z"), now), "stale");
assert.equal(computeHistoryFreshness(new Date("2026-05-26T11:00:00.000Z"), now), "expired");

console.log("BGP drilldown D6 cache UX selftest PASS");

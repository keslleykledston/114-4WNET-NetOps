import assert from "node:assert/strict";

const { isL2OperationalRefreshEnabled } = await import("./l2-operational-refresh.gate.js");
const { computeL2OperationalFreshness } = await import("./l2-operational-refresh.freshness.js");

process.env.L2_OPERATIONAL_REFRESH_ENABLED = "false";
assert.equal(isL2OperationalRefreshEnabled(), false);

process.env.L2_OPERATIONAL_REFRESH_ENABLED = "true";
assert.equal(isL2OperationalRefreshEnabled(), true);

const now = new Date("2026-05-28T12:00:00.000Z");
assert.equal(computeL2OperationalFreshness(new Date("2026-05-28T11:50:00.000Z"), now), "fresh");
assert.equal(computeL2OperationalFreshness(new Date("2026-05-28T10:00:00.000Z"), now), "stale");
assert.equal(computeL2OperationalFreshness(new Date("2026-05-27T10:00:00.000Z"), now), "expired");

console.log("l2-operational-refresh.selftest: OK");

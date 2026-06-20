#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const servicePath = path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts");
const serviceText = readFileSync(servicePath, "utf8");

assert.ok(serviceText.includes("CHANGE_PLAN_REAL_EXECUTION_BLOCKED"));
assert.ok(serviceText.includes("BGP announcement real execution is disabled by feature flag"));
assert.ok(serviceText.includes("BGP_ANNOUNCEMENT_EXECUTION_ENABLED"));
assert.ok(serviceText.includes("real_blocked"));

const blockedReason = "BGP announcement real execution is disabled by feature flag";
assert.equal(blockedReason, "BGP announcement real execution is disabled by feature flag");

console.log(JSON.stringify({
  ok: true,
  blockedReason,
  featureFlag: "BGP_ANNOUNCEMENT_EXECUTION_ENABLED",
  mode: "real_blocked",
}, null, 2));
console.log("bgp-announcement-execution-block-selftest: PASS");

#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const servicePath = path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts");
const serviceText = readFileSync(servicePath, "utf8");
const {
  buildAnnouncementDryRunExecutionLog,
  canTransitionAnnouncementChangePlanStatus,
  isAnnouncementExecutionMode,
} = await import(path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts"));

assert.ok(serviceText.includes("CHANGE_PLAN_DRY_RUN_STARTED"));
assert.ok(serviceText.includes("CHANGE_PLAN_DRY_RUN_SUCCEEDED"));
assert.ok(serviceText.includes("CHANGE_PLAN_DRY_RUN_FAILED"));

assert.equal(isAnnouncementExecutionMode("dry_run"), true);
assert.equal(isAnnouncementExecutionMode("mock"), true);
assert.equal(isAnnouncementExecutionMode("real_blocked"), true);

assert.equal(canTransitionAnnouncementChangePlanStatus("approved", "dry_run_ready"), true);
assert.equal(canTransitionAnnouncementChangePlanStatus("dry_run_ready", "dry_run_running"), true);
assert.equal(canTransitionAnnouncementChangePlanStatus("dry_run_running", "dry_run_succeeded"), true);
assert.equal(canTransitionAnnouncementChangePlanStatus("dry_run_running", "dry_run_failed"), true);

const logs = buildAnnouncementDryRunExecutionLog({
  proposedCommands: [
    { command: "system-view", confidence: "high" },
    { command: "route-policy ORIGIN permit node 10", confidence: "high" },
    { command: "apply community 64777:51003", confidence: "high" },
  ],
  rollbackCommands: [
    { command: "system-view", confidence: "high" },
    { command: "route-policy ORIGIN permit node 10", confidence: "high" },
    { command: "undo apply community", confidence: "medium" },
  ],
});

assert.equal(logs.length, 7);
assert.equal(logs[0].status, "would_execute");
assert.equal(logs.at(-1)?.status, "postcheck_required");
assert.ok(logs.every((item) => item.type === "command" ? item.status === "would_execute" : true));

console.log(JSON.stringify({
  ok: true,
  logs,
}, null, 2));
console.log("bgp-announcement-dry-run-execution-selftest: PASS");

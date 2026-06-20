#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const servicePath = path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts");
const serviceText = readFileSync(servicePath, "utf8");
const {
  buildAnnouncementExecutionLockKey,
  assessAnnouncementExecutionLockAvailability,
  buildAnnouncementRealExecutionGuardFindings,
} = await import(path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts"));

assert.ok(serviceText.includes("EXECUTION_LOCK_ACTIVE"));
assert.ok(serviceText.includes("EXECUTION_LOCK_RELEASED"));
assert.ok(serviceText.includes("EXECUTION_LOCK_REQUIRED"));

assert.equal(buildAnnouncementExecutionLockKey({
  deviceId: 7,
  targetPolicyName: " ORIGIN-TEST ",
  node: 10,
  upstreamCircuitId: "10",
}), "7|origin-test|10|10");

const now = new Date("2026-01-01T00:00:00.000Z");
const acquired = assessAnnouncementExecutionLockAvailability({
  now,
  locks: [{ status: "active", expiresAt: "2026-01-01T01:00:00.000Z" }],
});
assert.equal(acquired.canAcquire, false);
assert.equal(acquired.activeLockExists, true);

const expired = assessAnnouncementExecutionLockAvailability({
  now,
  locks: [{ status: "active", expiresAt: "2025-12-31T23:00:00.000Z" }],
});
assert.equal(expired.canAcquire, true);
assert.equal(expired.expiredLockCount, 1);

const guardBlocked = buildAnnouncementRealExecutionGuardFindings({
  executionEnabled: true,
  approvalApproved: true,
  dryRunSucceeded: true,
  postcheckRequired: true,
  lockAcquired: false,
  lockConflict: true,
  baseSnapshotFound: true,
  baseSnapshotLatest: true,
  targetModifiable: true,
  targetType: "origin_target",
  riskLevel: "low",
  refreshInProgress: false,
  permissionGranted: true,
  provider: "mock",
  maintenanceWindowAllowed: true,
  targetChanged: false,
  snapshotChanged: false,
});
assert.equal(guardBlocked.blocked, true);
assert.ok(guardBlocked.findings.some((finding) => finding.code === "EXECUTION_LOCK_ACTIVE"));

const guardOk = buildAnnouncementRealExecutionGuardFindings({
  executionEnabled: true,
  approvalApproved: true,
  dryRunSucceeded: true,
  postcheckRequired: true,
  lockAcquired: true,
  lockConflict: false,
  baseSnapshotFound: true,
  baseSnapshotLatest: true,
  targetModifiable: true,
  targetType: "origin_target",
  riskLevel: "low",
  refreshInProgress: false,
  permissionGranted: true,
  provider: "mock",
  maintenanceWindowAllowed: true,
  targetChanged: false,
  snapshotChanged: false,
});
assert.equal(guardOk.blocked, false);

console.log(JSON.stringify({
  ok: true,
  acquired,
  expired,
  guardBlocked,
  guardOk,
}, null, 2));
console.log("bgp-announcement-execution-lock-selftest: PASS");

#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const servicePath = path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts");
const serviceText = readFileSync(servicePath, "utf8");
const {
  buildAnnouncementRealExecutionGuardFindings,
} = await import(path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts"));

assert.ok(serviceText.includes("EXECUTION_FLAG_DISABLED"));
assert.ok(serviceText.includes("EXECUTION_APPROVAL_REQUIRED"));
assert.ok(serviceText.includes("EXECUTION_DRY_RUN_REQUIRED"));
assert.ok(serviceText.includes("EXECUTION_PERMISSION_DENIED"));

const base = {
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
};

assert.equal(buildAnnouncementRealExecutionGuardFindings({ ...base }).blocked, false);
assert.ok(buildAnnouncementRealExecutionGuardFindings({ ...base, executionEnabled: false }).findings.some((finding) => finding.code === "EXECUTION_FLAG_DISABLED"));
assert.ok(buildAnnouncementRealExecutionGuardFindings({ ...base, approvalApproved: false }).findings.some((finding) => finding.code === "EXECUTION_APPROVAL_REQUIRED"));
assert.ok(buildAnnouncementRealExecutionGuardFindings({ ...base, dryRunSucceeded: false }).findings.some((finding) => finding.code === "EXECUTION_DRY_RUN_REQUIRED"));
assert.ok(buildAnnouncementRealExecutionGuardFindings({ ...base, riskLevel: "critical" }).findings.some((finding) => finding.code === "EXECUTION_RISK_CRITICAL"));
assert.ok(buildAnnouncementRealExecutionGuardFindings({ ...base, targetType: "customer_export", targetModifiable: false }).findings.some((finding) => finding.code === "TARGET_IS_EXPORT_POLICY"));
assert.ok(buildAnnouncementRealExecutionGuardFindings({ ...base, lockAcquired: false, lockConflict: true }).findings.some((finding) => finding.code === "EXECUTION_LOCK_ACTIVE"));
assert.ok(buildAnnouncementRealExecutionGuardFindings({ ...base, permissionGranted: false }).findings.some((finding) => finding.code === "EXECUTION_PERMISSION_DENIED"));
assert.ok(buildAnnouncementRealExecutionGuardFindings({ ...base, provider: "disabled" }).findings.some((finding) => finding.code === "EXECUTION_PROVIDER_DISABLED"));
assert.ok(buildAnnouncementRealExecutionGuardFindings({ ...base, targetChanged: true }).findings.some((finding) => finding.code === "EXECUTION_TARGET_CHANGED"));
assert.ok(buildAnnouncementRealExecutionGuardFindings({ ...base, snapshotChanged: true }).findings.some((finding) => finding.code === "EXECUTION_SNAPSHOT_CHANGED"));

console.log(JSON.stringify({
  ok: true,
  base,
}, null, 2));
console.log("bgp-announcement-real-execution-guard-selftest: PASS");

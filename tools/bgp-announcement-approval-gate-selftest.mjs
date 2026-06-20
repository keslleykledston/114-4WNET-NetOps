#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const servicePath = path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts");
const serviceText = readFileSync(servicePath, "utf8");
const {
  canTransitionAnnouncementChangePlanStatus,
  buildAnnouncementApprovalRequestFindings,
} = await import(path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts"));

assert.ok(serviceText.includes("CHANGE_PLAN_APPROVAL_REQUESTED"));
assert.ok(serviceText.includes("CHANGE_PLAN_INVALID_STATUS"));
assert.ok(serviceText.includes("CHANGE_PLAN_HAS_CRITICAL_RISK"));
assert.ok(serviceText.includes("CHANGE_PLAN_CONFLICT_ACTIVE"));

assert.equal(canTransitionAnnouncementChangePlanStatus("draft", "pending_approval"), true);
assert.equal(canTransitionAnnouncementChangePlanStatus("pending_approval", "approved"), true);
assert.equal(canTransitionAnnouncementChangePlanStatus("pending_approval", "rejected"), true);
assert.equal(canTransitionAnnouncementChangePlanStatus("rejected", "approved"), false);
assert.equal(canTransitionAnnouncementChangePlanStatus("draft", "dry_run_running"), false);

const basePlan = {
  id: 7,
  deviceId: 44,
  status: "draft",
  targetType: "origin_target",
  riskLevel: "high",
  baseSnapshotId: 99,
  targetPolicyName: "ORIGIN-TEST",
  upstreamCircuitId: "10",
  node: 10,
  proposedCommands: [{ command: "apply community 64777:51003", confidence: "high" }],
  rollbackCommands: [{ command: "undo apply community", confidence: "high" }],
  preview: { previewId: "bgp-preview-v1.test" },
};

const gateOk = buildAnnouncementApprovalRequestFindings({
  changePlan: basePlan,
  latestSnapshotId: 99,
  refreshInProgress: false,
  activeConflict: false,
});
assert.equal(gateOk.blocked, false);

const criticalGate = buildAnnouncementApprovalRequestFindings({
  changePlan: { ...basePlan, riskLevel: "critical" },
  latestSnapshotId: 99,
  refreshInProgress: false,
  activeConflict: false,
});
assert.equal(criticalGate.blocked, true);
assert.ok(criticalGate.findings.some((finding) => finding.code === "CHANGE_PLAN_HAS_CRITICAL_RISK"));

const missingCommandsGate = buildAnnouncementApprovalRequestFindings({
  changePlan: { ...basePlan, proposedCommands: [], rollbackCommands: [] },
  latestSnapshotId: 99,
  refreshInProgress: false,
  activeConflict: false,
});
assert.equal(missingCommandsGate.blocked, true);
assert.ok(missingCommandsGate.findings.some((finding) => finding.code === "CHANGE_PLAN_COMMANDS_MISSING"));
assert.ok(missingCommandsGate.findings.some((finding) => finding.code === "CHANGE_PLAN_ROLLBACK_MISSING"));

const conflictGate = buildAnnouncementApprovalRequestFindings({
  changePlan: basePlan,
  latestSnapshotId: 99,
  refreshInProgress: true,
  activeConflict: true,
});
assert.equal(conflictGate.blocked, true);
assert.ok(conflictGate.findings.some((finding) => finding.code === "REFRESH_IN_PROGRESS"));
assert.ok(conflictGate.findings.some((finding) => finding.code === "CHANGE_PLAN_CONFLICT_ACTIVE"));

console.log(JSON.stringify({
  ok: true,
  gateOk,
  criticalGate,
  missingCommandsGate,
  conflictGate,
}, null, 2));
console.log("bgp-announcement-approval-gate-selftest: PASS");

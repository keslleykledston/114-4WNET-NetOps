#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewPath = path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.preview.service.ts");
const executionPath = path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts");
const timelinePath = path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.timeline-utils.ts");

const {
  simulateAnnouncementPreview,
  encodeAnnouncementPreview,
  decodeAnnouncementPreview,
  buildAnnouncementPreviewTargetGateFindings,
} = await import(previewPath);

const {
  buildAnnouncementApprovalRequestFindings,
  buildAnnouncementDryRunGateFindings,
  buildAnnouncementDryRunExecutionLog,
  buildAnnouncementPostcheckComparison,
  buildAnnouncementRollbackGateFindings,
  buildAnnouncementRollbackExecutionLog,
  buildRollbackPostcheckFindings,
  buildAnnouncementRealExecutionGuardFindings,
  isAnnouncementRealExecutionBlocked,
  isAnnouncementRollbackRealExecutionBlocked,
  canTransitionAnnouncementChangePlanStatus,
  assessAnnouncementExecutionLockAvailability,
} = await import(executionPath);

const { buildAnnouncementTimelapse, compareAnnouncementMatrixPayloads } = await import(timelinePath);

const BASE_SNAPSHOT_ID = 1001;
const DEVICE_ID = 44;
const COLLECTION_ID = 909;

const baseFixture = {
  baseSnapshotId: BASE_SNAPSHOT_ID,
  deviceId: DEVICE_ID,
  collectionId: COLLECTION_ID,
  targetPolicyName: "CUST-RP",
  targetType: "customer_import_target",
  node: 10,
  upstreamCircuitId: "10",
  upstreamName: "C10",
  prefixScope: {
    type: "ip_prefix",
    name: "CUST-PFX",
    expandedPrefixes: [{ index: 10, action: "permit", prefix: "45.187.201.0/24", raw: "ip ip-prefix CUST-PFX index 10 permit 45.187.201.0 24" }],
    affectedPrefixCount: 1,
    shared: false,
  },
  currentState: "On",
  currentCommunity: "64777:51001",
  currentCommunitySourceType: "direct",
  currentCommunitySourceName: null,
  currentCommunities: ["64777:50101", "64777:51001", "64777:51601"],
  communitySets: [],
  note: "e2e flow",
};

// 1. Snapshot base (simulated matrix payloads)
const previousMatrix = {
  columns: [{ key: "10", label: "C10", upstreamCircuitId: "10", upstreamName: "C10" }],
  rows: [{
    targetPolicyName: baseFixture.targetPolicyName,
    targetType: baseFixture.targetType,
    family: "ipv4",
    node: 10,
    prefixScope: baseFixture.prefixScope,
    cells: {
      "10": { state: "On", label: "On", community: "64777:51001", findings: [] },
    },
    findings: [],
  }],
  generatedFrom: "policy_graph_community_resolver",
  featureStatus: "community_cells",
};

// 2. Target gate — modifiable target
const targetGate = buildAnnouncementPreviewTargetGateFindings({
  targetType: "customer_import_target",
  includeInAnnouncementMatrix: true,
  policyType: "customer_import_target",
});
assert.equal(targetGate.blocked, false);

const exportGate = buildAnnouncementPreviewTargetGateFindings({
  targetType: "customer_export",
  includeInAnnouncementMatrix: false,
  policyType: "customer_export",
});
assert.equal(exportGate.blocked, true);
assert.equal(exportGate.code, "TARGET_IS_EXPORT_POLICY");

// 3. Preview On -> P2
const preview = simulateAnnouncementPreview({
  ...baseFixture,
  desiredState: "P2",
});
assert.equal(preview.desiredState, "P2");
assert.equal(preview.currentState, "On");
assert.ok(preview.proposedCommands.length > 0);
assert.ok(preview.rollbackCommands.length > 0);
assert.equal(preview.riskLevel !== "critical", true);

const previewId = encodeAnnouncementPreview(preview);
const decoded = decodeAnnouncementPreview(previewId);
assert.equal(decoded?.baseSnapshotId, BASE_SNAPSHOT_ID);
assert.equal(decoded?.targetPolicyName, "CUST-RP");

// 4. Change-plan draft payload
const draftPlan = {
  id: 501,
  deviceId: DEVICE_ID,
  status: "draft",
  targetType: "customer_import_target",
  riskLevel: preview.riskLevel,
  baseSnapshotId: BASE_SNAPSHOT_ID,
  targetPolicyName: preview.targetPolicyName,
  upstreamCircuitId: preview.upstreamCircuitId,
  node: preview.node,
  proposedCommands: preview.proposedCommands,
  rollbackCommands: preview.rollbackCommands,
  preview: { previewId, ...preview },
};

// 5. Request approval gate
const approvalGate = buildAnnouncementApprovalRequestFindings({
  changePlan: draftPlan,
  latestSnapshotId: BASE_SNAPSHOT_ID,
  refreshInProgress: false,
  activeConflict: false,
});
assert.equal(approvalGate.blocked, false);
assert.equal(canTransitionAnnouncementChangePlanStatus("draft", "pending_approval"), true);

// 6. Approve transition
assert.equal(canTransitionAnnouncementChangePlanStatus("pending_approval", "approved"), true);
const approvedPlan = { ...draftPlan, status: "approved" };

// 7. Dry-run gate + logs (no SSH)
const dryRunGate = buildAnnouncementDryRunGateFindings({
  dryRunEnabled: true,
  executionEnabled: false,
  planStatus: "approved",
  approvalApproved: true,
});
assert.equal(dryRunGate.blocked, false);

const dryRunLogs = buildAnnouncementDryRunExecutionLog({
  proposedCommands: approvedPlan.proposedCommands,
  rollbackCommands: approvedPlan.rollbackCommands,
});
assert.ok(dryRunLogs.every((item) => item.type !== "command" || item.status === "would_execute"));
assert.equal(dryRunLogs.at(-1)?.status, "postcheck_required");
assert.equal(canTransitionAnnouncementChangePlanStatus("approved", "dry_run_ready"), true);
assert.equal(canTransitionAnnouncementChangePlanStatus("dry_run_running", "dry_run_succeeded"), true);

// 8. Postcheck simulated — expected matches observed
const observedMatrix = {
  rows: [{
    targetPolicyName: preview.targetPolicyName,
    targetType: preview.targetType,
    node: preview.node,
    family: "ipv4",
    prefixScope: preview.prefixScope,
    cells: {
      "10": { state: "P2", label: "P2", community: preview.desiredCommunity, findings: [] },
    },
    findings: [],
  }],
  upstreamAudit: { findings: [] },
};

const postcheck = buildAnnouncementPostcheckComparison({
  changePlan: {
    targetPolicyName: preview.targetPolicyName,
    targetType: preview.targetType,
    node: preview.node,
    upstreamCircuitId: preview.upstreamCircuitId,
    upstreamName: preview.upstreamName,
    currentState: preview.currentState,
    desiredState: preview.desiredState,
    currentCommunity: preview.currentCommunity,
    desiredCommunity: preview.desiredCommunity,
    baseSnapshotId: BASE_SNAPSHOT_ID,
    preview: { previewId, ...preview },
    postcheckStatus: "pending",
  },
  observedSnapshotId: BASE_SNAPSHOT_ID + 1,
  observedMatrix,
});
assert.equal(postcheck.status, "succeeded");

// 9. Rollback request gate
const dryRunSucceededPlan = {
  ...approvedPlan,
  status: "dry_run_succeeded",
  postcheckRequired: true,
  postcheckStatus: "succeeded",
  latestExecution: { mode: "dry_run", status: "succeeded" },
  latestPostcheck: { status: "succeeded" },
  approval: { status: "approved" },
};
assert.equal(buildAnnouncementRollbackGateFindings(dryRunSucceededPlan).length, 0);

// 10. Rollback dry-run log
const rollbackLog = buildAnnouncementRollbackExecutionLog(dryRunSucceededPlan.rollbackCommands, "dry_run");
assert.equal(rollbackLog.at(0)?.status, "would_execute");
assert.equal(rollbackLog.at(-1)?.status, "postcheck_required");

// 11. Rollback postcheck
const rollbackPostcheck = buildRollbackPostcheckFindings({
  rollback: { id: 901, rollbackToSnapshotId: BASE_SNAPSHOT_ID },
  plan: dryRunSucceededPlan,
  expected: {
    snapshot: { id: BASE_SNAPSHOT_ID },
    row: { cells: { "10": { state: "On", community: preview.currentCommunity, findings: [] } } },
    cell: { state: "On", community: preview.currentCommunity, findings: [] },
  },
  observed: {
    snapshot: { id: BASE_SNAPSHOT_ID + 2 },
    row: { cells: { "10": { state: "On", community: preview.currentCommunity, findings: [] } } },
    cell: { state: "On", community: preview.currentCommunity, findings: [] },
  },
});
assert.equal(rollbackPostcheck.status, "succeeded");

// 12. History / timelapse
const currentMatrix = {
  ...previousMatrix,
  rows: [{
    ...previousMatrix.rows[0],
    cells: {
      "10": { state: "P2", label: "P2", community: preview.desiredCommunity, findings: [] },
    },
  }],
};
const diff = compareAnnouncementMatrixPayloads(previousMatrix, currentMatrix);
assert.ok(diff.changed.length > 0 || diff.summary.changed > 0);

const timeline = buildAnnouncementTimelapse([
  {
    id: 1,
    deviceId: DEVICE_ID,
    targetPolicyName: preview.targetPolicyName,
    family: "ipv4",
    prefix: "45.187.201.0/24",
    upstreamCircuitId: "10",
    upstreamName: "C10",
    eventType: "cell_state_changed",
    oldState: "On",
    newState: "P2",
    oldCommunity: preview.currentCommunity,
    newCommunity: preview.desiredCommunity,
    snapshotId: BASE_SNAPSHOT_ID + 1,
    detectedAt: "2026-06-20T10:00:00.000Z",
    createdAt: "2026-06-20T10:00:00.000Z",
  },
  {
    id: 2,
    deviceId: DEVICE_ID,
    targetPolicyName: preview.targetPolicyName,
    family: "ipv4",
    prefix: "45.187.201.0/24",
    upstreamCircuitId: "10",
    upstreamName: "C10",
    eventType: "cell_state_changed",
    oldState: "—",
    newState: "On",
    oldCommunity: null,
    newCommunity: preview.currentCommunity,
    snapshotId: BASE_SNAPSHOT_ID,
    detectedAt: "2026-06-19T10:00:00.000Z",
    createdAt: "2026-06-19T10:00:00.000Z",
  },
]);
assert.equal(timeline[0].newState, "On");
assert.equal(timeline[1].newState, "P2");

// 13. Real execution + rollback real remain blocked
assert.equal(isAnnouncementRealExecutionBlocked(false), true);
assert.equal(isAnnouncementRollbackRealExecutionBlocked(false), true);

const realGuard = buildAnnouncementRealExecutionGuardFindings({
  executionEnabled: false,
  approvalApproved: true,
  dryRunSucceeded: true,
  postcheckRequired: true,
  lockAcquired: true,
  lockConflict: false,
  baseSnapshotFound: true,
  baseSnapshotLatest: true,
  targetModifiable: true,
  targetType: "customer_import_target",
  riskLevel: preview.riskLevel,
  refreshInProgress: false,
  permissionGranted: true,
  provider: "disabled",
  maintenanceWindowAllowed: true,
  targetChanged: false,
  snapshotChanged: false,
});
assert.equal(realGuard.blocked, true);
assert.ok(realGuard.findings.some((finding) => finding.code === "EXECUTION_FLAG_DISABLED"));

const lockBusy = assessAnnouncementExecutionLockAvailability({
  locks: [{ status: "active", expiresAt: new Date(Date.now() + 60_000).toISOString() }],
});
assert.equal(lockBusy.canAcquire, false);

const rejectedDryRun = buildAnnouncementDryRunGateFindings({
  dryRunEnabled: true,
  executionEnabled: false,
  planStatus: "rejected",
  approvalApproved: false,
});
assert.equal(rejectedDryRun.blocked, true);

console.log(JSON.stringify({
  ok: true,
  flow: {
    previewId,
    desiredState: preview.desiredState,
    dryRunSteps: dryRunLogs.length,
    postcheck: postcheck.status,
    rollbackPostcheck: rollbackPostcheck.status,
    diffChanged: diff.summary.changed,
    timelineEvents: timeline.length,
    realExecutionBlocked: true,
    rollbackRealBlocked: true,
  },
}, null, 2));
console.log("bgp-announcement-e2e-flow-selftest: PASS");

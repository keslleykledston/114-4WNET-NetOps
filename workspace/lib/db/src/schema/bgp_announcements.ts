import { boolean, integer, jsonb, index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices.js";

export const bgpAnnouncementMatrixSnapshotsTable = pgTable("bgp_announcement_matrix_snapshots", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id"),
  collectionId: integer("collection_id"),
  snapshotVersion: integer("snapshot_version").notNull().default(1),
  snapshotHash: text("snapshot_hash").notNull(),
  isLatest: boolean("is_latest").notNull().default(true),
  status: text("status").notNull(),
  source: text("source").notNull(),
  familyScope: text("family_scope").notNull().default("all"),
  totalTargets: integer("total_targets").notNull().default(0),
  totalUpstreams: integer("total_upstreams").notNull().default(0),
  totalCells: integer("total_cells").notNull().default(0),
  totalFindings: integer("total_findings").notNull().default(0),
  totalCriticalFindings: integer("total_critical_findings").notNull().default(0),
  matrixJson: jsonb("matrix_json").notNull(),
  summaryJson: jsonb("summary_json").notNull(),
  filtersJson: jsonb("filters_json").notNull(),
  generatedAt: timestamp("generated_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by"),
}, (table) => ({
  deviceLatestIdx: index("bgp_announcement_matrix_snapshots_device_latest_idx").on(table.deviceId, table.isLatest),
  deviceGeneratedAtIdx: index("bgp_announcement_matrix_snapshots_device_generated_at_idx").on(table.deviceId, table.generatedAt),
  hashIdx: index("bgp_announcement_matrix_snapshots_hash_idx").on(table.snapshotHash),
}));

export const bgpAnnouncementMatrixRunsTable = pgTable("bgp_announcement_matrix_runs", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  requestedBy: integer("requested_by"),
  triggerType: text("trigger_type").notNull().default("manual"),
  status: text("status").notNull(),
  startedAt: timestamp("started_at").notNull(),
  finishedAt: timestamp("finished_at"),
  collectionId: integer("collection_id"),
  previousSnapshotId: integer("previous_snapshot_id"),
  newSnapshotId: integer("new_snapshot_id"),
  errorMessage: text("error_message"),
  logsJson: jsonb("logs_json").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bgpAnnouncementMatrixDiffsTable = pgTable("bgp_announcement_matrix_diffs", {
  id: serial("id").primaryKey(),
  previousSnapshotId: integer("previous_snapshot_id").notNull(),
  currentSnapshotId: integer("current_snapshot_id").notNull(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  diffHash: text("diff_hash").notNull(),
  addedJson: jsonb("added_json").notNull().default([]),
  removedJson: jsonb("removed_json").notNull().default([]),
  changedJson: jsonb("changed_json").notNull().default([]),
  summaryJson: jsonb("summary_json").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bgpAnnouncementHistoryEventsTable = pgTable("bgp_announcement_history_events", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  targetPolicyName: text("target_policy_name").notNull(),
  family: text("family").notNull(),
  prefix: text("prefix"),
  upstreamCircuitId: text("upstream_circuit_id"),
  upstreamName: text("upstream_name"),
  eventType: text("event_type").notNull(),
  oldState: text("old_state"),
  newState: text("new_state"),
  oldCommunity: text("old_community"),
  newCommunity: text("new_community"),
  snapshotId: integer("snapshot_id").notNull(),
  detectedAt: timestamp("detected_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bgpAnnouncementChangePlansTable = pgTable("bgp_announcement_change_plans", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  baseSnapshotId: integer("base_snapshot_id").notNull(),
  collectionId: integer("collection_id"),
  previewId: text("preview_id").notNull(),
  targetPolicyName: text("target_policy_name").notNull(),
  targetType: text("target_type").notNull(),
  node: integer("node"),
  upstreamCircuitId: text("upstream_circuit_id").notNull(),
  upstreamName: text("upstream_name").notNull(),
  currentState: text("current_state").notNull(),
  desiredState: text("desired_state").notNull(),
  currentCommunity: text("current_community"),
  desiredCommunity: text("desired_community"),
  diffJson: jsonb("diff_json").notNull(),
  proposedCommandsJson: jsonb("proposed_commands_json").notNull(),
  rollbackCommandsJson: jsonb("rollback_commands_json").notNull(),
  findingsJson: jsonb("findings_json").notNull(),
  riskLevel: text("risk_level").notNull(),
  status: text("status").notNull().default("draft"),
  note: text("note"),
  postcheckRequired: boolean("postcheck_required").notNull().default(true),
  postcheckStatus: text("postcheck_status").notNull().default("pending"),
  previewJson: jsonb("preview_json").notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  deviceStatusIdx: index("bgp_announcement_change_plans_device_status_idx").on(table.deviceId, table.status),
  deviceCreatedAtIdx: index("bgp_announcement_change_plans_device_created_at_idx").on(table.deviceId, table.createdAt),
  previewIdx: index("bgp_announcement_change_plans_preview_idx").on(table.previewId),
}));

export const bgpAnnouncementApprovalsTable = pgTable("bgp_announcement_approvals", {
  id: serial("id").primaryKey(),
  changePlanId: integer("change_plan_id").notNull().references(() => bgpAnnouncementChangePlansTable.id, { onDelete: "cascade" }),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  baseSnapshotId: integer("base_snapshot_id").notNull(),
  requestedBy: integer("requested_by"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  status: text("status").notNull().default("pending"),
  reason: text("reason"),
  riskLevel: text("risk_level").notNull(),
  findingsJson: jsonb("findings_json").notNull(),
  diffJson: jsonb("diff_json").notNull(),
  proposedCommandsJson: jsonb("proposed_commands_json").notNull(),
  rollbackCommandsJson: jsonb("rollback_commands_json").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  planIdx: index("bgp_announcement_approvals_change_plan_idx").on(table.changePlanId),
  deviceStatusIdx: index("bgp_announcement_approvals_device_status_idx").on(table.deviceId, table.status),
}));

export const bgpAnnouncementExecutionsTable = pgTable("bgp_announcement_executions", {
  id: serial("id").primaryKey(),
  changePlanId: integer("change_plan_id").notNull().references(() => bgpAnnouncementChangePlansTable.id, { onDelete: "cascade" }),
  approvalId: integer("approval_id").references(() => bgpAnnouncementApprovalsTable.id, { onDelete: "set null" }),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
  startedBy: integer("started_by"),
  startedAt: timestamp("started_at").notNull(),
  finishedAt: timestamp("finished_at"),
  baseSnapshotId: integer("base_snapshot_id").notNull(),
  collectionId: integer("collection_id"),
  proposedCommandsJson: jsonb("proposed_commands_json").notNull(),
  rollbackCommandsJson: jsonb("rollback_commands_json").notNull(),
  executionLogJson: jsonb("execution_log_json").notNull(),
  resultJson: jsonb("result_json").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  planIdx: index("bgp_announcement_executions_change_plan_idx").on(table.changePlanId),
  deviceStatusIdx: index("bgp_announcement_executions_device_status_idx").on(table.deviceId, table.status),
}));

export const bgpAnnouncementExecutionLocksTable = pgTable("bgp_announcement_execution_locks", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  targetPolicyName: text("target_policy_name").notNull(),
  node: integer("node"),
  upstreamCircuitId: text("upstream_circuit_id").notNull(),
  changePlanId: integer("change_plan_id").notNull().references(() => bgpAnnouncementChangePlansTable.id, { onDelete: "cascade" }),
  executionId: integer("execution_id").references(() => bgpAnnouncementExecutionsTable.id, { onDelete: "set null" }),
  status: text("status").notNull(),
  lockedBy: integer("locked_by"),
  lockedAt: timestamp("locked_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  releasedAt: timestamp("released_at"),
  releaseReason: text("release_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  deviceTargetIdx: index("bgp_announcement_execution_locks_device_target_idx").on(table.deviceId, table.targetPolicyName, table.node, table.upstreamCircuitId),
  deviceStatusIdx: index("bgp_announcement_execution_locks_device_status_idx").on(table.deviceId, table.status),
}));

export const bgpAnnouncementPostchecksTable = pgTable("bgp_announcement_postchecks", {
  id: serial("id").primaryKey(),
  changePlanId: integer("change_plan_id").notNull().references(() => bgpAnnouncementChangePlansTable.id, { onDelete: "cascade" }),
  executionId: integer("execution_id").references(() => bgpAnnouncementExecutionsTable.id, { onDelete: "set null" }),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  expectedSnapshotId: integer("expected_snapshot_id"),
  observedSnapshotId: integer("observed_snapshot_id"),
  expectedState: text("expected_state").notNull(),
  observedState: text("observed_state").notNull(),
  expectedCommunity: text("expected_community"),
  observedCommunity: text("observed_community"),
  status: text("status").notNull(),
  diffJson: jsonb("diff_json").notNull(),
  findingsJson: jsonb("findings_json").notNull(),
  startedAt: timestamp("started_at").notNull(),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  planIdx: index("bgp_announcement_postchecks_change_plan_idx").on(table.changePlanId),
  deviceStatusIdx: index("bgp_announcement_postchecks_device_status_idx").on(table.deviceId, table.status),
}));

export const bgpAnnouncementRollbacksTable = pgTable("bgp_announcement_rollbacks", {
  id: serial("id").primaryKey(),
  changePlanId: integer("change_plan_id").notNull().references(() => bgpAnnouncementChangePlansTable.id, { onDelete: "cascade" }),
  executionId: integer("execution_id").references(() => bgpAnnouncementExecutionsTable.id, { onDelete: "set null" }),
  approvalId: integer("approval_id").references(() => bgpAnnouncementApprovalsTable.id, { onDelete: "set null" }),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  baseSnapshotId: integer("base_snapshot_id").notNull(),
  rollbackToSnapshotId: integer("rollback_to_snapshot_id").notNull(),
  currentSnapshotId: integer("current_snapshot_id"),
  status: text("status").notNull(),
  mode: text("mode").notNull(),
  requestedBy: integer("requested_by"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  rollbackCommandsJson: jsonb("rollback_commands_json").notNull(),
  rollbackDiffJson: jsonb("rollback_diff_json").notNull(),
  rollbackLogJson: jsonb("rollback_log_json").notNull().default([]),
  postcheckId: integer("postcheck_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  planIdx: index("bgp_announcement_rollbacks_change_plan_idx").on(table.changePlanId),
  deviceStatusIdx: index("bgp_announcement_rollbacks_device_status_idx").on(table.deviceId, table.status),
}));

export type BgpAnnouncementMatrixSnapshotRow = typeof bgpAnnouncementMatrixSnapshotsTable.$inferSelect;
export type BgpAnnouncementMatrixRunRow = typeof bgpAnnouncementMatrixRunsTable.$inferSelect;
export type BgpAnnouncementMatrixDiffRow = typeof bgpAnnouncementMatrixDiffsTable.$inferSelect;
export type BgpAnnouncementHistoryEventRow = typeof bgpAnnouncementHistoryEventsTable.$inferSelect;
export type BgpAnnouncementChangePlanRow = typeof bgpAnnouncementChangePlansTable.$inferSelect;
export type BgpAnnouncementApprovalRow = typeof bgpAnnouncementApprovalsTable.$inferSelect;
export type BgpAnnouncementExecutionRow = typeof bgpAnnouncementExecutionsTable.$inferSelect;
export type BgpAnnouncementExecutionLockRow = typeof bgpAnnouncementExecutionLocksTable.$inferSelect;
export type BgpAnnouncementPostcheckRow = typeof bgpAnnouncementPostchecksTable.$inferSelect;
export type BgpAnnouncementRollbackRow = typeof bgpAnnouncementRollbacksTable.$inferSelect;

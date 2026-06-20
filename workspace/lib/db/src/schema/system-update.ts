import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const systemVersionsTable = pgTable("system_versions", {
  id: serial("id").primaryKey(),
  version: text("version").notNull(),
  gitCommit: text("git_commit").notNull(),
  gitBranch: text("git_branch").notNull(),
  gitTag: text("git_tag"),
  buildId: text("build_id"),
  installedAt: timestamp("installed_at").defaultNow().notNull(),
  installedBy: text("installed_by"),
  source: text("source").notNull().default("local_git"),
  status: text("status").notNull().default("installed"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const systemUpdateChecksTable = pgTable("system_update_checks", {
  id: serial("id").primaryKey(),
  checkedBy: text("checked_by"),
  currentVersion: text("current_version").notNull(),
  currentCommit: text("current_commit").notNull(),
  remoteVersion: text("remote_version").notNull(),
  remoteCommit: text("remote_commit").notNull(),
  updateAvailable: boolean("update_available").notNull().default(false),
  channel: text("channel").notNull().default("stable"),
  changelog: text("changelog"),
  riskLevel: text("risk_level").notNull().default("low"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const systemUpdateRunsTable = pgTable("system_update_runs", {
  id: serial("id").primaryKey(),
  requestedBy: text("requested_by"),
  status: text("status").notNull().default("pending"),
  fromVersion: text("from_version").notNull(),
  fromCommit: text("from_commit").notNull(),
  toVersion: text("to_version").notNull(),
  toCommit: text("to_commit").notNull(),
  channel: text("channel").notNull().default("stable"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  failedAt: timestamp("failed_at"),
  failureStage: text("failure_stage"),
  failureReason: text("failure_reason"),
  rollbackStartedAt: timestamp("rollback_started_at"),
  rollbackFinishedAt: timestamp("rollback_finished_at"),
  rollbackStatus: text("rollback_status"),
  backupId: integer("backup_id"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const systemUpdateStepsTable = pgTable("system_update_steps", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => systemUpdateRunsTable.id, { onDelete: "cascade" }),
  stepName: text("step_name").notNull(),
  stepOrder: integer("step_order").notNull(),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  durationMs: integer("duration_ms"),
  sanitizedOutput: text("sanitized_output"),
  errorMessage: text("error_message"),
  metadataJson: jsonb("metadata_json"),
});

export const systemUpdateBackupsTable = pgTable("system_update_backups", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => systemUpdateRunsTable.id, { onDelete: "cascade" }),
  backupType: text("backup_type").notNull(),
  path: text("path").notNull(),
  checksum: text("checksum"),
  sizeBytes: integer("size_bytes"),
  status: text("status").notNull().default("created"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  metadataJson: jsonb("metadata_json"),
});

export const insertSystemVersionSchema = createInsertSchema(systemVersionsTable).omit({
  id: true,
  createdAt: true,
});

export const insertSystemUpdateCheckSchema = createInsertSchema(systemUpdateChecksTable).omit({
  id: true,
  createdAt: true,
});

export const insertSystemUpdateRunSchema = createInsertSchema(systemUpdateRunsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSystemUpdateStepSchema = createInsertSchema(systemUpdateStepsTable).omit({
  id: true,
});

export const insertSystemUpdateBackupSchema = createInsertSchema(systemUpdateBackupsTable).omit({
  id: true,
  createdAt: true,
});

export type SystemVersion = typeof systemVersionsTable.$inferSelect;
export type SystemUpdateCheck = typeof systemUpdateChecksTable.$inferSelect;
export type SystemUpdateRun = typeof systemUpdateRunsTable.$inferSelect;
export type SystemUpdateStep = typeof systemUpdateStepsTable.$inferSelect;
export type SystemUpdateBackup = typeof systemUpdateBackupsTable.$inferSelect;

export type InsertSystemVersion = z.infer<typeof insertSystemVersionSchema>;
export type InsertSystemUpdateCheck = z.infer<typeof insertSystemUpdateCheckSchema>;
export type InsertSystemUpdateRun = z.infer<typeof insertSystemUpdateRunSchema>;
export type InsertSystemUpdateStep = z.infer<typeof insertSystemUpdateStepSchema>;
export type InsertSystemUpdateBackup = z.infer<typeof insertSystemUpdateBackupSchema>;

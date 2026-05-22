import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";
import { deviceGroupsTable } from "./devices";
import { usersTable } from "./auth";

export const scheduledJobsTable = pgTable("scheduled_jobs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  jobType: text("job_type").notNull(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id"),
  contextsJson: jsonb("contexts_json").notNull(),
  cronExpression: text("cron_expression"),
  intervalMinutes: integer("interval_minutes").notNull().default(60),
  enabled: boolean("enabled").notNull().default(true),
  runOnStartup: boolean("run_on_startup").notNull().default(false),
  maxRuntimeSeconds: integer("max_runtime_seconds").notNull().default(3600),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
}, (table) => ({
  enabledIdx: index("scheduled_jobs_enabled_idx").on(table.enabled),
  nextRunAtIdx: index("scheduled_jobs_next_run_at_idx").on(table.nextRunAt),
  targetIdx: index("scheduled_jobs_target_idx").on(table.targetType, table.targetId),
}));

export const scheduledJobRunsTable = pgTable("scheduled_job_runs", {
  id: serial("id").primaryKey(),
  scheduledJobId: integer("scheduled_job_id").notNull().references(() => scheduledJobsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  triggeredBy: text("triggered_by").notNull(),
  actorId: integer("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
  summaryJson: jsonb("summary_json"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  jobStartedIdx: index("scheduled_job_runs_job_started_idx").on(table.scheduledJobId, table.startedAt),
}));

export const scheduledJobRunItemsTable = pgTable("scheduled_job_run_items", {
  id: serial("id").primaryKey(),
  scheduledJobRunId: integer("scheduled_job_run_id").notNull().references(() => scheduledJobRunsTable.id, { onDelete: "cascade" }),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  actionType: text("action_type").notNull(),
  resultRefType: text("result_ref_type"),
  resultRefId: text("result_ref_id"),
  summaryJson: jsonb("summary_json"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  runIdIdx: index("scheduled_job_run_items_run_id_idx").on(table.scheduledJobRunId),
  deviceIdIdx: index("scheduled_job_run_items_device_id_idx").on(table.deviceId),
}));

export type ScheduledJob = typeof scheduledJobsTable.$inferSelect;
export type ScheduledJobRun = typeof scheduledJobRunsTable.$inferSelect;
export type ScheduledJobRunItem = typeof scheduledJobRunItemsTable.$inferSelect;

import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { devicesTable } from "./devices";
import { configTemplatesTable } from "./templates";
import { usersTable } from "./auth";

export const provisioningJobsTable = pgTable("provisioning_jobs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("draft"),
  deviceIds: text("device_ids").notNull(),
  templateId: integer("template_id").references(() => configTemplatesTable.id),
  parameters: text("parameters"),
  validatedAt: timestamp("validated_at"),
  executedAt: timestamp("executed_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  approvedByUserId: integer("approved_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  executionPlanJson: text("execution_plan_json"),
  rollbackPlanGenerated: text("rollback_plan_generated"),
  postcheckAt: timestamp("postcheck_at"),
  postcheckResult: text("postcheck_result"),
  postcheckOutput: text("postcheck_output"),
  maintenanceWindowStart: timestamp("maintenance_window_start"),
  maintenanceWindowEnd: timestamp("maintenance_window_end"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const provisioningStepsTable = pgTable("provisioning_steps", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => provisioningJobsTable.id, { onDelete: "cascade" }),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  stepName: text("step_name").notNull(),
  status: text("status").notNull().default("pending"),
  configApplied: text("config_applied"),
  output: text("output"),
  stdout: text("stdout"),
  stderr: text("stderr"),
  commandSent: text("command_sent"),
  commandLocked: boolean("command_locked").default(false),
  errorMessage: text("error_message"),
  executedAt: timestamp("executed_at"),
});

export const insertProvisioningJobSchema = createInsertSchema(provisioningJobsTable).omit({ id: true, createdAt: true, validatedAt: true, executedAt: true, completedAt: true });
export const insertProvisioningStepSchema = createInsertSchema(provisioningStepsTable).omit({ id: true });

export type InsertProvisioningJob = z.infer<typeof insertProvisioningJobSchema>;
export type ProvisioningJob = typeof provisioningJobsTable.$inferSelect;
export type ProvisioningStep = typeof provisioningStepsTable.$inferSelect;

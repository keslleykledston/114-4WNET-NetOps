import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { devicesTable } from "./devices";
import { configTemplatesTable } from "./templates";
import { usersTable } from "./auth";
import { tenantsTable } from "./connectors";

export const provisioningJobsTable = pgTable("provisioning_jobs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("draft"),
  serviceType: text("service_type"),
  tenantId: integer("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
  customerName: text("customer_name"),
  description: text("description"),
  deviceIds: text("device_ids").notNull(),
  targetDevicesJson: text("target_devices_json"),
  templateId: integer("template_id").references(() => configTemplatesTable.id),
  parameters: text("parameters"),
  parametersJson: text("parameters_json"),
  validationResultJson: text("validation_result_json"),
  renderedConfigJson: text("rendered_config_json"),
  renderedRollbackJson: text("rendered_rollback_json"),
  renderedValidationJson: text("rendered_validation_json"),
  riskSummaryJson: text("risk_summary_json"),
  approvalStatus: text("approval_status"),
  approvedBy: text("approved_by"),
  approvedParametersJson: text("approved_parameters_json"),
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
  createdBy: text("created_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

export const insertProvisioningJobSchema = createInsertSchema(provisioningJobsTable).omit({ id: true, createdAt: true, updatedAt: true, validatedAt: true, executedAt: true, completedAt: true });
export const insertProvisioningStepSchema = createInsertSchema(provisioningStepsTable).omit({ id: true });

export type InsertProvisioningJob = z.infer<typeof insertProvisioningJobSchema>;
export type ProvisioningJob = typeof provisioningJobsTable.$inferSelect;
export type ProvisioningStep = typeof provisioningStepsTable.$inferSelect;

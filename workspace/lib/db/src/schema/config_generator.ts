import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { devicesTable } from "./devices.js";
import { tenantsTable } from "./connectors.js";
import { usersTable } from "./auth.js";

export const configGeneratorTemplatesTable = pgTable("config_generator_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  serviceType: text("service_type").notNull(),
  vendor: text("vendor").notNull(),
  platform: text("platform").notNull(),
  templateKey: text("template_key").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  templateKeyUq: uniqueIndex("config_generator_templates_template_key_uq").on(table.templateKey),
  serviceTypeIdx: index("config_generator_templates_service_type_idx").on(table.serviceType),
  vendorPlatformIdx: index("config_generator_templates_vendor_platform_idx").on(table.vendor, table.platform),
  activeIdx: index("config_generator_templates_is_active_idx").on(table.isActive),
}));

export const configGeneratorTemplateVersionsTable = pgTable("config_generator_template_versions", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => configGeneratorTemplatesTable.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  content: text("content").notNull(),
  schemaJson: jsonb("schema_json").notNull().default({}),
  renderer: text("renderer").notNull(),
  checksum: text("checksum").notNull(),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  templateVersionUq: uniqueIndex("config_generator_template_versions_template_version_uq").on(table.templateId, table.version),
  templateIdx: index("config_generator_template_versions_template_id_idx").on(table.templateId),
  checksumIdx: index("config_generator_template_versions_checksum_idx").on(table.checksum),
  createdByIdx: index("config_generator_template_versions_created_by_idx").on(table.createdBy),
}));

export const configGeneratorRunsTable = pgTable("config_generator_runs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  serviceType: text("service_type").notNull(),
  templateVersionId: integer("template_version_id").notNull().references(() => configGeneratorTemplateVersionsTable.id, { onDelete: "restrict" }),
  status: text("status").notNull(),
  inputJson: jsonb("input_json").notNull().default({}),
  fieldOriginsJson: jsonb("field_origins_json").notNull().default({}),
  renderedConfig: text("rendered_config").notNull().default(""),
  validationSummary: jsonb("validation_summary").notNull().default({}),
  riskLevel: text("risk_level").notNull().default("low"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("config_generator_runs_tenant_id_idx").on(table.tenantId),
  deviceIdx: index("config_generator_runs_device_id_idx").on(table.deviceId),
  templateVersionIdx: index("config_generator_runs_template_version_id_idx").on(table.templateVersionId),
  createdAtIdx: index("config_generator_runs_created_at_idx").on(table.createdAt),
  tenantDeviceCreatedIdx: index("config_generator_runs_tenant_device_created_idx").on(
    table.tenantId,
    table.deviceId,
    table.createdAt,
  ),
  createdByIdx: index("config_generator_runs_created_by_idx").on(table.createdBy),
}));

export const configGeneratorValidationsTable = pgTable("config_generator_validations", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => configGeneratorRunsTable.id, { onDelete: "cascade" }),
  severity: text("severity").notNull(),
  code: text("code").notNull(),
  message: text("message").notNull(),
  contextJson: jsonb("context_json").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  runIdx: index("config_generator_validations_run_id_idx").on(table.runId),
  severityIdx: index("config_generator_validations_severity_idx").on(table.severity),
}));

export const configGeneratorArtifactsTable = pgTable("config_generator_artifacts", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => configGeneratorRunsTable.id, { onDelete: "cascade" }),
  artifactType: text("artifact_type").notNull(),
  content: text("content").notNull(),
  checksum: text("checksum").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  runIdx: index("config_generator_artifacts_run_id_idx").on(table.runId),
  typeIdx: index("config_generator_artifacts_artifact_type_idx").on(table.artifactType),
  checksumIdx: index("config_generator_artifacts_checksum_idx").on(table.checksum),
}));

export const configGeneratorChangeRequestsTable = pgTable("config_generator_change_requests", {
  id: serial("id").primaryKey(),
  generationRunId: integer("generation_run_id").notNull().references(() => configGeneratorRunsTable.id, { onDelete: "cascade" }),
  approvalStatus: text("approval_status").notNull().default("draft"),
  approvedBy: integer("approved_by").references(() => usersTable.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  executionStatus: text("execution_status").notNull().default("blocked"),
  executionPlanJson: jsonb("execution_plan_json").notNull().default({}),
  rollbackPlanJson: jsonb("rollback_plan_json").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  runUq: uniqueIndex("config_generator_change_requests_generation_run_id_uq").on(table.generationRunId),
  approvalIdx: index("config_generator_change_requests_approval_status_idx").on(table.approvalStatus),
  executionIdx: index("config_generator_change_requests_execution_status_idx").on(table.executionStatus),
  approvedByIdx: index("config_generator_change_requests_approved_by_idx").on(table.approvedBy),
}));

export const insertConfigGeneratorTemplateSchema = createInsertSchema(configGeneratorTemplatesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertConfigGeneratorTemplateVersionSchema = createInsertSchema(configGeneratorTemplateVersionsTable).omit({
  id: true,
  createdAt: true,
});

export const insertConfigGeneratorRunSchema = createInsertSchema(configGeneratorRunsTable).omit({
  id: true,
  createdAt: true,
});

export const insertConfigGeneratorValidationSchema = createInsertSchema(configGeneratorValidationsTable).omit({
  id: true,
  createdAt: true,
});

export const insertConfigGeneratorArtifactSchema = createInsertSchema(configGeneratorArtifactsTable).omit({
  id: true,
  createdAt: true,
});

export const insertConfigGeneratorChangeRequestSchema = createInsertSchema(configGeneratorChangeRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ConfigGeneratorTemplate = typeof configGeneratorTemplatesTable.$inferSelect;
export type ConfigGeneratorTemplateVersion = typeof configGeneratorTemplateVersionsTable.$inferSelect;
export type ConfigGeneratorRun = typeof configGeneratorRunsTable.$inferSelect;
export type ConfigGeneratorValidation = typeof configGeneratorValidationsTable.$inferSelect;
export type ConfigGeneratorArtifact = typeof configGeneratorArtifactsTable.$inferSelect;
export type ConfigGeneratorChangeRequest = typeof configGeneratorChangeRequestsTable.$inferSelect;

export type InsertConfigGeneratorTemplate = z.infer<typeof insertConfigGeneratorTemplateSchema>;
export type InsertConfigGeneratorTemplateVersion = z.infer<typeof insertConfigGeneratorTemplateVersionSchema>;
export type InsertConfigGeneratorRun = z.infer<typeof insertConfigGeneratorRunSchema>;
export type InsertConfigGeneratorValidation = z.infer<typeof insertConfigGeneratorValidationSchema>;
export type InsertConfigGeneratorArtifact = z.infer<typeof insertConfigGeneratorArtifactSchema>;
export type InsertConfigGeneratorChangeRequest = z.infer<typeof insertConfigGeneratorChangeRequestSchema>;

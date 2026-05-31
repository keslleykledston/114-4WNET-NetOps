import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const provisioningTemplatesTable = pgTable("provisioning_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  vendor: text("vendor").notNull(),
  serviceType: text("service_type").notNull(),
  version: text("version").notNull().default("1.0.0"),
  status: text("status").notNull().default("DRAFT"),
  source: text("source").notNull().default("db"),
  variablesJson: text("variables_json"),
  validationRulesJson: text("validation_rules_json"),
  templateBody: text("template_body"),
  description: text("description"),
  createdBy: text("created_by"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const provisioningTemplateVersionsTable = pgTable("provisioning_template_versions", {
  id: serial("id").primaryKey(),
  templateId: serial("template_id").notNull(),
  version: text("version").notNull(),
  status: text("status").notNull(),
  templateBody: text("template_body"),
  variablesJson: text("variables_json"),
  validationRulesJson: text("validation_rules_json"),
  changedBy: text("changed_by"),
  changeReason: text("change_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const provisioningTemplateAuditLogsTable = pgTable("provisioning_template_audit_logs", {
  id: serial("id").primaryKey(),
  templateId: serial("template_id"),
  actor: text("actor"),
  action: text("action").notNull(),
  metadataJson: text("metadata_json"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProvisioningTemplateSchema = createInsertSchema(provisioningTemplatesTable);
export const insertProvisioningTemplateVersionSchema = createInsertSchema(provisioningTemplateVersionsTable);
export const insertProvisioningTemplateAuditLogSchema = createInsertSchema(provisioningTemplateAuditLogsTable);

export type ProvisioningTemplate = typeof provisioningTemplatesTable.$inferSelect;
export type InsertProvisioningTemplate = z.infer<typeof insertProvisioningTemplateSchema>;
export type ProvisioningTemplateVersion = typeof provisioningTemplateVersionsTable.$inferSelect;
export type InsertProvisioningTemplateVersion = z.infer<typeof insertProvisioningTemplateVersionSchema>;
export type ProvisioningTemplateAuditLog = typeof provisioningTemplateAuditLogsTable.$inferSelect;
export type InsertProvisioningTemplateAuditLog = z.infer<typeof insertProvisioningTemplateAuditLogSchema>;

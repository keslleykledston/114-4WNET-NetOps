import { pgTable, serial, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { devicesTable } from "./devices";

export const compliancePoliciesTable = pgTable("compliance_policies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  context: text("context").notNull(),
  severity: text("severity").notNull().default("medium"),
  ruleType: text("rule_type").notNull().default("regex"),
  rulePattern: text("rule_pattern"),
  vendor: text("vendor"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const complianceJobsTable = pgTable("compliance_jobs", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  contexts: text("contexts").notNull(),
  policyProfileName: text("policy_profile_name").default("huawei-vrp-edge-balanced"),
  status: text("status").notNull().default("pending"),
  passCount: integer("pass_count").notNull().default(0),
  failCount: integer("fail_count").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const compliancePolicyProfilesTable = pgTable("compliance_policy_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  deviceRole: text("device_role"),
  vendor: text("vendor"),
  platform: text("platform"),
  enabled: boolean("enabled").notNull().default(true),
  rulesJson: jsonb("rules_json").notNull().default({}),
  thresholdsJson: jsonb("thresholds_json").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const complianceFindingsTable = pgTable("compliance_findings", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => complianceJobsTable.id, { onDelete: "cascade" }),
  policyId: integer("policy_id").notNull().references(() => compliancePoliciesTable.id, { onDelete: "cascade" }),
  policyName: text("policy_name").notNull(),
  severity: text("severity").notNull(),
  context: text("context").notNull(),
  result: text("result").notNull(),
  detail: text("detail"),
  evidence: text("evidence"),
  status: text("status"),
  message: text("message"),
  recommendation: text("recommendation"),
  blocking: boolean("blocking").notNull().default(false),
  source: text("source"),
  confidence: text("confidence"),
  objectType: text("object_type"),
  objectId: text("object_id"),
  objectName: text("object_name"),
  ruleId: text("rule_id"),
  ruleName: text("rule_name"),
  rawReference: text("raw_reference"),
  operationalCategory: text("operational_category"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
});

export const insertCompliancePolicySchema = createInsertSchema(compliancePoliciesTable).omit({ id: true, createdAt: true });
export const insertComplianceJobSchema = createInsertSchema(complianceJobsTable).omit({ id: true, createdAt: true, startedAt: true, completedAt: true });
export const insertComplianceFindingSchema = createInsertSchema(complianceFindingsTable).omit({ id: true });
export const insertCompliancePolicyProfileSchema = createInsertSchema(compliancePolicyProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertCompliancePolicy = z.infer<typeof insertCompliancePolicySchema>;
export type CompliancePolicy = typeof compliancePoliciesTable.$inferSelect;
export type InsertComplianceJob = z.infer<typeof insertComplianceJobSchema>;
export type ComplianceJob = typeof complianceJobsTable.$inferSelect;
export type ComplianceFinding = typeof complianceFindingsTable.$inferSelect;
export type InsertCompliancePolicyProfile = z.infer<typeof insertCompliancePolicyProfileSchema>;
export type CompliancePolicyProfile = typeof compliancePolicyProfilesTable.$inferSelect;

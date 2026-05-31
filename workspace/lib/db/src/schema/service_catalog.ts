import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const serviceCatalogTable = pgTable("service_catalog", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  vendor: text("vendor").notNull().default("any"),
  serviceType: text("service_type").notNull(),
  templateId: text("template_id"),
  formSchemaJson: text("form_schema_json"),
  status: text("status").notNull().default("ACTIVE"),
  icon: text("icon"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const serviceRequestsTable = pgTable("service_requests", {
  id: serial("id").primaryKey(),
  serviceCatalogId: serial("service_catalog_id").notNull(),
  deviceId: serial("device_id"),
  connectorGroupId: serial("connector_group_id"),
  payloadJson: text("payload_json").notNull(),
  status: text("status").notNull().default("DRAFT"),
  provisioningJobId: serial("provisioning_job_id"),
  previewDataJson: text("preview_data_json"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const serviceRequestAuditLogsTable = pgTable("service_request_audit_logs", {
  id: serial("id").primaryKey(),
  serviceRequestId: serial("service_request_id").notNull(),
  actor: text("actor"),
  action: text("action").notNull(),
  metadataJson: text("metadata_json"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertServiceCatalogSchema = createInsertSchema(serviceCatalogTable);
export const insertServiceRequestSchema = createInsertSchema(serviceRequestsTable);

export type ServiceCatalog = typeof serviceCatalogTable.$inferSelect;
export type ServiceRequest = typeof serviceRequestsTable.$inferSelect;
export type ServiceRequestAuditLog = typeof serviceRequestAuditLogsTable.$inferSelect;

import { boolean, index, integer, pgTable, serial, text, timestamp, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices.js";
import { tenantsTable } from "./connectors.js";
import { usersTable } from "./auth.js";

export const credentialProfilesTable = pgTable(
  "credential_profiles",
  {
    id: text("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    vendor: text("vendor"),
    username: text("username"),
    encryptedSecret: text("encrypted_secret").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    tenantNameUq: uniqueIndex("credential_profiles_tenant_name_uq").on(table.tenantId, table.name),
    tenantTypeIdx: index("credential_profiles_tenant_type_idx").on(table.tenantId, table.type),
    activeIdx: index("credential_profiles_active_idx").on(table.isActive),
  }),
);

export const credentialAssignmentsTable = pgTable(
  "credential_assignments",
  {
    deviceId: integer("device_id")
      .notNull()
      .references(() => devicesTable.id, { onDelete: "cascade" }),
    credentialProfileId: text("credential_profile_id")
      .notNull()
      .references(() => credentialProfilesTable.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull().default(100),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    deviceCredentialUq: uniqueIndex("credential_assignments_device_profile_uq").on(
      table.deviceId,
      table.credentialProfileId,
    ),
    devicePriorityIdx: index("credential_assignments_device_priority_idx").on(table.deviceId, table.priority),
  }),
);

export const credentialAuditLogsTable = pgTable(
  "credential_audit_logs",
  {
    id: serial("id").primaryKey(),
    credentialProfileId: text("credential_profile_id").references(() => credentialProfilesTable.id, {
      onDelete: "set null",
    }),
    deviceId: integer("device_id").references(() => devicesTable.id, { onDelete: "set null" }),
    actorId: integer("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    profileIdx: index("credential_audit_logs_profile_idx").on(table.credentialProfileId),
    deviceIdx: index("credential_audit_logs_device_idx").on(table.deviceId),
    actionIdx: index("credential_audit_logs_action_idx").on(table.action),
    createdAtIdx: index("credential_audit_logs_created_at_idx").on(table.createdAt),
  }),
);

export type CredentialProfile = typeof credentialProfilesTable.$inferSelect;
export type CredentialAssignment = typeof credentialAssignmentsTable.$inferSelect;
export type CredentialAuditLog = typeof credentialAuditLogsTable.$inferSelect;

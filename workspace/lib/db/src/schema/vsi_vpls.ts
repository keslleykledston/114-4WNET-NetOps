import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices.js";

export const vsiServicesTable = pgTable(
  "vsi_services",
  {
    id: serial("id").primaryKey(),
    serviceKey: text("service_key").notNull(),
    tenantId: integer("tenant_id"),
    tenantName: text("tenant_name").notNull(),
    vsId: text("vs_id"),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    status: text("status").notNull(),
    severity: text("severity").notNull(),
    sitesCount: integer("sites_count").notNull().default(0),
    devicesCount: integer("devices_count").notNull().default(0),
    acsCount: integer("acs_count").notNull().default(0),
    pwsCount: integer("pws_count").notNull().default(0),
    pwsUpCount: integer("pws_up_count").notNull().default(0),
    alarmsCount: integer("alarms_count").notNull().default(0),
    hasDivergence: boolean("has_divergence").notNull().default(false),
    firstSeenAt: timestamp("first_seen_at"),
    lastSeenAt: timestamp("last_seen_at"),
    lastCollectedAt: timestamp("last_collected_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    serviceKeyUq: uniqueIndex("vsi_services_service_key_uq").on(table.serviceKey),
    tenantIdx: index("vsi_services_tenant_id_idx").on(table.tenantId),
    vsIdIdx: index("vsi_services_vs_id_idx").on(table.vsId),
    statusIdx: index("vsi_services_status_idx").on(table.status),
    collectedAtIdx: index("vsi_services_last_collected_at_idx").on(table.lastCollectedAt),
  }),
);

export const vsiServiceMembersTable = pgTable(
  "vsi_service_members",
  {
    id: serial("id").primaryKey(),
    serviceId: integer("service_id")
      .notNull()
      .references(() => vsiServicesTable.id, { onDelete: "cascade" }),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devicesTable.id, { onDelete: "cascade" }),
    site: text("site").notNull(),
    vendor: text("vendor").notNull(),
    circuitId: integer("circuit_id").notNull(),
    circuitType: text("circuit_type").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    vsId: text("vs_id"),
    vsiName: text("vsi_name"),
    source: text("source").notNull(),
    adminStatus: text("admin_status").notNull(),
    operStatus: text("oper_status").notNull(),
    pwStatus: text("pw_status"),
    localInterface: text("local_interface"),
    parentInterface: text("parent_interface"),
    peerIp: text("peer_ip"),
    peerIpsJson: jsonb("peer_ips_json").notNull().default([]),
    peersJson: jsonb("peers_json").notNull().default([]),
    pwSummaryJson: jsonb("pw_summary_json").notNull().default({}),
    outerVlan: integer("outer_vlan"),
    innerVlan: integer("inner_vlan"),
    macCount: integer("mac_count"),
    findingsJson: jsonb("findings_json").notNull().default([]),
    firstSeenAt: timestamp("first_seen_at").notNull(),
    lastSeenAt: timestamp("last_seen_at").notNull(),
    rawEvidence: text("raw_evidence"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    serviceIdx: index("vsi_service_members_service_id_idx").on(table.serviceId),
    deviceIdx: index("vsi_service_members_device_id_idx").on(table.deviceId),
    serviceDeviceUq: uniqueIndex("vsi_service_members_service_device_uq").on(table.serviceId, table.deviceId),
  }),
);

export const vsiServiceConfigsTable = pgTable(
  "vsi_service_configs",
  {
    id: serial("id").primaryKey(),
    serviceId: integer("service_id")
      .notNull()
      .references(() => vsiServicesTable.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => vsiServiceMembersTable.id, { onDelete: "cascade" }),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devicesTable.id, { onDelete: "cascade" }),
    collectedAt: timestamp("collected_at").notNull(),
    parserStatus: text("parser_status"),
    source: text("source"),
    rawConfig: text("raw_config"),
    configHash: text("config_hash"),
    commandUsed: text("command_used"),
    parserVersion: text("parser_version"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    serviceIdx: index("vsi_service_configs_service_id_idx").on(table.serviceId),
    memberIdx: index("vsi_service_configs_member_id_idx").on(table.memberId),
    deviceIdx: index("vsi_service_configs_device_id_idx").on(table.deviceId),
  }),
);

export const vsiServiceStatusHistoryTable = pgTable(
  "vsi_service_status_history",
  {
    id: serial("id").primaryKey(),
    serviceId: integer("service_id")
      .notNull()
      .references(() => vsiServicesTable.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    severity: text("severity").notNull(),
    reason: text("reason").notNull(),
    evidenceJson: jsonb("evidence_json").notNull().default([]),
    collectedAt: timestamp("collected_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    serviceIdx: index("vsi_service_status_history_service_id_idx").on(table.serviceId),
    collectedAtIdx: index("vsi_service_status_history_collected_at_idx").on(table.collectedAt),
  }),
);

export const vsiServiceEventsTable = pgTable(
  "vsi_service_events",
  {
    id: serial("id").primaryKey(),
    serviceId: integer("service_id")
      .notNull()
      .references(() => vsiServicesTable.id, { onDelete: "cascade" }),
    deviceId: integer("device_id").references(() => devicesTable.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    message: text("message").notNull(),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    serviceIdx: index("vsi_service_events_service_id_idx").on(table.serviceId),
    deviceIdx: index("vsi_service_events_device_id_idx").on(table.deviceId),
    typeIdx: index("vsi_service_events_event_type_idx").on(table.eventType),
    createdAtIdx: index("vsi_service_events_created_at_idx").on(table.createdAt),
  }),
);

export type VsiServiceRow = typeof vsiServicesTable.$inferSelect;
export type VsiServiceMemberRow = typeof vsiServiceMembersTable.$inferSelect;
export type VsiServiceConfigRow = typeof vsiServiceConfigsTable.$inferSelect;
export type VsiServiceStatusHistoryRow = typeof vsiServiceStatusHistoryTable.$inferSelect;
export type VsiServiceEventRow = typeof vsiServiceEventsTable.$inferSelect;

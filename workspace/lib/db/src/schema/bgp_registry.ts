import { boolean, integer, index, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices.js";

export const bgpCustomersTable = pgTable(
  "bgp_customers",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    code: varchar("code", { length: 64 }).notNull(),
    asn: integer("asn").notNull(),
    type: varchar("type", { length: 32 }).notNull().default("customer"),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    parentCustomerId: integer("parent_customer_id"),
    asSet: varchar("as_set", { length: 255 }),
    irrSource: varchar("irr_source", { length: 64 }),
    irrValidationMode: varchar("irr_validation_mode", { length: 32 }),
    rpkiValidationMode: varchar("rpki_validation_mode", { length: 32 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: integer("created_by"),
    updatedBy: integer("updated_by"),
  },
  (table) => [
    uniqueIndex("uq_bgp_customers_code").on(table.code),
    uniqueIndex("uq_bgp_customers_asn").on(table.asn),
    index("idx_bgp_customers_status").on(table.status),
    index("idx_bgp_customers_parent_customer_id").on(table.parentCustomerId),
  ],
);

export const bgpCustomerConnectionsTable = pgTable(
  "bgp_customer_connections",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id").notNull().references(() => bgpCustomersTable.id, { onDelete: "cascade" }),
    deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
    addressFamily: varchar("address_family", { length: 16 }).notNull().default("ipv4"),
    neighborIpv4: varchar("neighbor_ipv4", { length: 64 }),
    neighborIpv6: varchar("neighbor_ipv6", { length: 128 }),
    interfaceName: varchar("interface_name", { length: 128 }),
    vrfName: varchar("vrf_name", { length: 128 }),
    importRoutePolicy: varchar("import_route_policy", { length: 128 }),
    exportRoutePolicy: varchar("export_route_policy", { length: 128 }),
    originRoutePolicy: varchar("origin_route_policy", { length: 128 }),
    ipv4PrefixList: varchar("ipv4_prefix_list", { length: 128 }),
    ipv6PrefixList: varchar("ipv6_prefix_list", { length: 128 }),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    source: varchar("source", { length: 32 }).notNull().default("manual"),
    lastSnapshotId: integer("last_snapshot_id"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_bgp_customer_connections_customer_id").on(table.customerId),
    index("idx_bgp_customer_connections_device_id").on(table.deviceId),
    index("idx_bgp_customer_connections_neighbor_ipv4").on(table.neighborIpv4),
    index("idx_bgp_customer_connections_neighbor_ipv6").on(table.neighborIpv6),
  ],
);

export const bgpAuthorizedPrefixesTable = pgTable(
  "bgp_authorized_prefixes",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id").notNull().references(() => bgpCustomersTable.id, { onDelete: "cascade" }),
    connectionId: integer("connection_id").references(() => bgpCustomerConnectionsTable.id, { onDelete: "set null" }),
    prefix: varchar("prefix", { length: 64 }).notNull(),
    addressFamily: varchar("address_family", { length: 16 }).notNull().default("ipv4"),
    originAsn: integer("origin_asn"),
    maxPrefixLength: integer("max_prefix_length"),
    source: varchar("source", { length: 32 }).notNull().default("manual"),
    validationStatus: varchar("validation_status", { length: 24 }).notNull().default("active"),
    description: text("description"),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_bgp_authorized_prefixes_customer_id").on(table.customerId),
    index("idx_bgp_authorized_prefixes_prefix").on(table.prefix),
    uniqueIndex("uq_bgp_authorized_prefixes_customer_prefix_afi").on(table.customerId, table.prefix, table.addressFamily),
  ],
);

export const bgpExitPointsTable = pgTable(
  "bgp_exit_points",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    type: varchar("type", { length: 32 }).notNull().default("upstream"),
    asn: integer("asn"),
    circuitId: varchar("circuit_id", { length: 64 }),
    deviceId: integer("device_id").references(() => devicesTable.id, { onDelete: "set null" }),
    neighborIpv4: varchar("neighbor_ipv4", { length: 64 }),
    neighborIpv6: varchar("neighbor_ipv6", { length: 128 }),
    exportRoutePolicy: varchar("export_route_policy", { length: 128 }),
    enabledIpv4: boolean("enabled_ipv4").notNull().default(true),
    enabledIpv6: boolean("enabled_ipv6").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_bgp_exit_points_slug").on(table.slug),
    index("idx_bgp_exit_points_circuit_id").on(table.circuitId),
    index("idx_bgp_exit_points_type").on(table.type),
    index("idx_bgp_exit_points_device_id").on(table.deviceId),
  ],
);

export const bgpExitCommunityActionsTable = pgTable(
  "bgp_exit_community_actions",
  {
    id: serial("id").primaryKey(),
    exitPointId: integer("exit_point_id").notNull().references(() => bgpExitPointsTable.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 24 }).notNull(),
    community: varchar("community", { length: 64 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    riskLevel: varchar("risk_level", { length: 16 }).notNull().default("low"),
    addressFamily: varchar("address_family", { length: 16 }),
    enabled: boolean("enabled").notNull().default(true),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_bgp_exit_community_actions_exit_point_id").on(table.exitPointId),
    uniqueIndex("uq_bgp_exit_community_actions_exit_action_family").on(table.exitPointId, table.action, table.addressFamily),
    uniqueIndex("uq_bgp_exit_community_actions_exit_community").on(table.exitPointId, table.community),
  ],
);

export const bgpRegistryAuditLogTable = pgTable(
  "bgp_registry_audit_log",
  {
    id: serial("id").primaryKey(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: integer("entity_id").notNull(),
    action: varchar("action", { length: 32 }).notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    actorUserId: integer("actor_user_id"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_bgp_registry_audit_log_entity").on(table.entityType, table.entityId)],
);

export type BgpCustomerRow = typeof bgpCustomersTable.$inferSelect;
export type BgpCustomerConnectionRow = typeof bgpCustomerConnectionsTable.$inferSelect;
export type BgpAuthorizedPrefixRow = typeof bgpAuthorizedPrefixesTable.$inferSelect;
export type BgpExitPointRow = typeof bgpExitPointsTable.$inferSelect;
export type BgpExitCommunityActionRow = typeof bgpExitCommunityActionsTable.$inferSelect;
export type BgpRegistryAuditLogRow = typeof bgpRegistryAuditLogTable.$inferSelect;

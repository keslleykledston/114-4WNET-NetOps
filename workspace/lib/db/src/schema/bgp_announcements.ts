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
  varchar,
} from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";
import { usersTable } from "./auth";

/** Upstream circuit catalog (provider/cdn/ix/pni/transit) per device. */
export const bgpUpstreamCircuitsTable = pgTable(
  "bgp_upstream_circuits",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devicesTable.id, { onDelete: "cascade" }),
    circuitId: varchar("circuit_id", { length: 4 }).notNull(),
    displayName: varchar("display_name", { length: 128 }).notNull(),
    shortName: varchar("short_name", { length: 64 }),
    role: varchar("role", { length: 32 }).notNull().default("provider"),
    remoteAs: integer("remote_as"),
    localAs: integer("local_as"),
    peerIp: varchar("peer_ip", { length: 64 }),
    peerGroupName: varchar("peer_group_name", { length: 128 }),
    importPolicyV4Name: varchar("import_policy_v4_name", { length: 200 }),
    importPolicyV6Name: varchar("import_policy_v6_name", { length: 200 }),
    exportPolicyV4Name: varchar("export_policy_v4_name", { length: 200 }),
    exportPolicyV6Name: varchar("export_policy_v6_name", { length: 200 }),
    exportPolicyName: varchar("export_policy_name", { length: 200 }),
    communityNamespace: varchar("community_namespace", { length: 32 }).default("5"),
    communityBaseAsn: integer("community_base_asn").default(64777),
    enabledForMatrix: boolean("enabled_for_matrix").notNull().default(true),
    auditOnly: boolean("audit_only").notNull().default(true),
    modifiable: boolean("modifiable").notNull().default(false),
    source: varchar("source", { length: 40 }).notNull().default("discovered"),
    confidence: varchar("confidence", { length: 16 }).notNull().default("medium"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_bgp_upstream_circuit_device_cid").on(table.deviceId, table.circuitId),
    index("bgp_upstream_circuits_device_id_idx").on(table.deviceId),
  ],
);

/** Global semantic catalog for community action codes. */
export const bgpCommunityActionCatalogTable = pgTable(
  "bgp_community_action_catalog",
  {
    id: serial("id").primaryKey(),
    actionCode: varchar("action_code", { length: 4 }).notNull(),
    label: varchar("label", { length: 16 }).notNull(),
    state: varchar("state", { length: 16 }).notNull(),
    prependCount: integer("prepend_count"),
    totalAsPathCount: integer("total_as_path_count"),
    direction: varchar("direction", { length: 16 }).default("export"),
    descriptionShort: varchar("description_short", { length: 128 }),
    descriptionFull: text("description_full"),
    isDestructive: boolean("is_destructive").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [uniqueIndex("uq_bgp_community_action_code").on(table.actionCode)],
);

/** Materialized announcement targets (origin/customer). */
export const bgpAnnouncementTargetsTable = pgTable(
  "bgp_announcement_targets",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devicesTable.id, { onDelete: "cascade" }),
    targetType: varchar("target_type", { length: 32 }).notNull(),
    targetName: varchar("target_name", { length: 200 }).notNull(),
    family: varchar("family", { length: 8 }).notNull(),
    prefix: varchar("prefix", { length: 64 }),
    customerAsn: integer("customer_asn"),
    routePolicyName: varchar("route_policy_name", { length: 200 }).notNull(),
    node: integer("node"),
    matchType: varchar("match_type", { length: 32 }),
    prefixListName: varchar("prefix_list_name", { length: 128 }),
    expandedPrefixesJson: jsonb("expanded_prefixes_json"),
    modifiable: boolean("modifiable").notNull().default(true),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    riskLevel: varchar("risk_level", { length: 16 }).notNull().default("low"),
    source: varchar("source", { length: 40 }).notNull(),
    confidence: varchar("confidence", { length: 16 }).notNull().default("medium"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("bgp_announcement_targets_device_id_idx").on(table.deviceId),
    index("bgp_announcement_targets_policy_idx").on(table.deviceId, table.routePolicyName),
  ],
);

/** Normalized community-list sets for exact-match lookup. */
export const bgpCommunitySetsTable = pgTable(
  "bgp_community_sets",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devicesTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    communitiesJson: jsonb("communities_json").notNull(),
    normalizedHash: varchar("normalized_hash", { length: 64 }).notNull(),
    semanticSummaryJson: jsonb("semantic_summary_json"),
    source: varchar("source", { length: 40 }).notNull().default("discovered"),
    isShared: boolean("is_shared").notNull().default(false),
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_bgp_community_sets_device_name").on(table.deviceId, table.name),
    index("bgp_community_sets_hash_idx").on(table.deviceId, table.normalizedHash),
  ],
);

/** Change plans (preview-only MVP; execution blocked by flag). */
export const bgpAnnouncementChangePlansTable = pgTable(
  "bgp_announcement_change_plans",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devicesTable.id, { onDelete: "cascade" }),
    targetPolicyName: varchar("target_policy_name", { length: 200 }).notNull(),
    targetType: varchar("target_type", { length: 16 }).notNull(),
    family: varchar("family", { length: 8 }).notNull(),
    node: integer("node").notNull(),
    upstreamCircuitId: varchar("upstream_circuit_id", { length: 4 }).notNull(),
    upstreamName: varchar("upstream_name", { length: 128 }),
    oldState: varchar("old_state", { length: 16 }),
    newState: varchar("new_state", { length: 16 }).notNull(),
    oldCommunitiesJson: jsonb("old_communities_json"),
    newCommunitiesJson: jsonb("new_communities_json"),
    communitySetMatchName: varchar("community_set_match_name", { length: 200 }),
    generatedScript: text("generated_script"),
    rollbackScript: text("rollback_script"),
    affectedPrefixesJson: jsonb("affected_prefixes_json"),
    riskLevel: varchar("risk_level", { length: 16 }).notNull().default("medium"),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    findingsJson: jsonb("findings_json"),
    createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    approvedBy: integer("approved_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("bgp_announcement_change_plans_device_id_idx").on(table.deviceId),
    index("bgp_announcement_change_plans_status_idx").on(table.status),
  ],
);

/** Read-only change previews (append-only; no execution). */
export const bgpAnnouncementChangePreviewsTable = pgTable(
  "bgp_announcement_change_previews",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devicesTable.id, { onDelete: "cascade" }),
    snapshotId: integer("snapshot_id"),
    targetId: varchar("target_id", { length: 256 }).notNull(),
    previewJson: jsonb("preview_json").notNull(),
    changePlanId: integer("change_plan_id"),
    createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("bgp_announcement_change_previews_device_created_idx").on(table.deviceId, table.createdAt),
    index("bgp_announcement_change_previews_snapshot_target_idx").on(table.snapshotId, table.targetId),
    index("bgp_announcement_change_previews_change_plan_id_idx").on(table.changePlanId),
  ],
);

/** Point-in-time matrix snapshots for timelapse / copilot history. */
export const bgpAnnouncementMatrixSnapshotsTable = pgTable(
  "bgp_announcement_matrix_snapshots",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devicesTable.id, { onDelete: "cascade" }),
    rowsJson: jsonb("rows_json").notNull(),
    upstreamsJson: jsonb("upstreams_json").default([]),
    metaJson: jsonb("meta_json").default({}),
    rowCount: integer("row_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("bgp_announcement_matrix_snapshots_device_created_idx").on(table.deviceId, table.createdAt),
  ],
);

export type BgpUpstreamCircuit = typeof bgpUpstreamCircuitsTable.$inferSelect;
export type BgpCommunityActionCatalog = typeof bgpCommunityActionCatalogTable.$inferSelect;
export type BgpAnnouncementTarget = typeof bgpAnnouncementTargetsTable.$inferSelect;
export type BgpCommunitySet = typeof bgpCommunitySetsTable.$inferSelect;
export type BgpAnnouncementChangePlan = typeof bgpAnnouncementChangePlansTable.$inferSelect;
export type BgpAnnouncementChangePreview = typeof bgpAnnouncementChangePreviewsTable.$inferSelect;
export type BgpAnnouncementMatrixSnapshot = typeof bgpAnnouncementMatrixSnapshotsTable.$inferSelect;

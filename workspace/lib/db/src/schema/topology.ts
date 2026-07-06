import { pgTable, serial, text, integer, timestamp, jsonb, uniqueIndex, boolean } from "drizzle-orm/pg-core";

export const topologyNodesTable = pgTable("topology_nodes", {
  id: serial("id").primaryKey(),
  nodeType: text("node_type", {
    enum: ["DEVICE", "INTERFACE", "BGP_PEER", "L2_CIRCUIT", "VSI", "VRF", "SERVICE", "RESOURCE"],
  }).notNull(),
  refId: integer("ref_id"),
  label: text("label").notNull(),
  metadataJson: jsonb("metadata_json").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueNode: uniqueIndex("unique_node_type_ref_label").on(table.nodeType, table.refId, table.label),
}));

export const topologyEdgesTable = pgTable("topology_edges", {
  id: serial("id").primaryKey(),
  sourceNodeId: integer("source_node_id").notNull().references(() => topologyNodesTable.id, { onDelete: "cascade" }),
  targetNodeId: integer("target_node_id").notNull().references(() => topologyNodesTable.id, { onDelete: "cascade" }),
  edgeType: text("edge_type", {
    enum: ["HAS_INTERFACE", "CONNECTED_TO", "HAS_BGP_PEER", "HAS_L2_CIRCUIT", "HAS_VSI", "USES_RESOURCE", "BELONGS_TO_VRF", "SERVICE_ON_DEVICE", "SERVICE_USES_CIRCUIT"],
  }).notNull(),
  confidence: integer("confidence").default(100),
  metadataJson: jsonb("metadata_json").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueEdge: uniqueIndex("unique_edge_source_target_type").on(table.sourceNodeId, table.targetNodeId, table.edgeType),
}));

export const topologySnapshotsTable = pgTable("topology_snapshots", {
  id: serial("id").primaryKey(),
  scopeType: text("scope_type").notNull(),
  scopeId: integer("scope_id"),
  nodesCount: integer("nodes_count"),
  edgesCount: integer("edges_count"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const topologyLayoutsTable = pgTable("topology_layouts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  scopeType: text("scope_type").notNull().default("global"),
  scopeId: integer("scope_id"),
  isActive: boolean("is_active").notNull().default(false),
  payloadJson: jsonb("payload_json").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type TopologyNode = typeof topologyNodesTable.$inferSelect;
export type TopologyEdge = typeof topologyEdgesTable.$inferSelect;
export type TopologySnapshot = typeof topologySnapshotsTable.$inferSelect;
export type TopologyLayout = typeof topologyLayoutsTable.$inferSelect;

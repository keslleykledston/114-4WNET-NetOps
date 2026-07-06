/**
 * Centralized domain types for the Network Map module.
 *
 * These shapes mirror what the future 4WNET_NETOPS backend API is expected
 * to return. The current mock service maps internal UI types
 * (`DeviceData` / `LinkData` in `./types`) into these contracts when needed.
 *
 * Keep this file free of UI / React imports — it is pure domain.
 */

import type { DeviceData, LinkData } from "./types";

export type NodeStatus = "UP" | "DOWN" | "PARTIAL" | "UNKNOWN" | "PLANNED";
export type Severity = "info" | "warning" | "critical";

export type NodeType =
  | "router"
  | "switch"
  | "olt"
  | "dwdm"
  | "firewall"
  | "server"
  | "customer"
  | "bgp"
  | "site";

export type SourceType =
  | "discovered"
  | "manual"
  | "planned"
  | "netbox"
  | "zabbix"
  | "database";

export type EdgeType =
  | "physical"
  | "lag"
  | "bgp"
  | "service"
  | "optical"
  | "planned"
  | "manual";

export type RefType =
  | "device"
  | "circuit"
  | "peer"
  | "customer"
  | "interface"
  | "site";

export interface TopologyPosition {
  x: number;
  y: number;
}

/** A node in the network topology graph (device, peer, customer, site, etc). */
export interface TopologyNode {
  id: string;
  tenantId: string;
  siteId: string;
  nodeType: NodeType;
  sourceType: SourceType;
  refType: RefType;
  refId: string;
  label: string;
  vendor: string;
  role: string;
  status: NodeStatus;
  severity: Severity;
  metadata: Record<string, unknown>;
  position: TopologyPosition;
}

/** An edge between two topology nodes (link, BGP session, circuit, etc). */
export interface TopologyEdge {
  id: string;
  tenantId: string;
  siteId: string;
  edgeType: EdgeType;
  sourceType: SourceType;
  fromNodeId: string;
  toNodeId: string;
  fromInterfaceId: string | null;
  toInterfaceId: string | null;
  capacityMbps: number;
  status: NodeStatus;
  confidenceScore: number;
  evidenceId: string | null;
  metadata: Record<string, unknown>;
}

/** A point-in-time capture of the full topology for diffing/history. */
export interface TopologySnapshot {
  id: string;
  tenantId: string;
  siteId: string;
  collectedAt: string; // ISO timestamp
  nodeCount: number;
  edgeCount: number;
  statusSummary: Record<NodeStatus, number>;
  diffSummary: {
    addedNodes: number;
    removedNodes: number;
    addedEdges: number;
    removedEdges: number;
    changedEdges: number;
  };
}

/** Evidence (raw collector output) backing a discovered node or edge. */
export interface TopologyEvidence {
  id: string;
  snapshotId: string;
  deviceId: string;
  source: "snmp" | "ssh" | "netconf" | "api" | "manual";
  commandOrOid: string;
  rawOutputHash: string;
  parsedJson: Record<string, unknown>;
  confidenceScore: number;
  createdAt: string;
}

/** Container returned by `topologyService.getTopology()`. */
export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

/** Diff structure returned by `topologyService.compareSnapshots()`. */
export interface SnapshotDiff {
  fromSnapshotId: string;
  toSnapshotId: string;
  addedNodes: string[];
  removedNodes: string[];
  addedEdges: string[];
  removedEdges: string[];
  changedEdges: Array<{ id: string; before: Partial<TopologyEdge>; after: Partial<TopologyEdge> }>;
}

/** Aggregate stats for the toolbar / header. */
export interface TopologyStats {
  nodeCount: number;
  edgeCount: number;
  byStatus: Record<NodeStatus, number>;
  byEdgeType: Record<EdgeType, number>;
  alarms: number;
}

/** Filter criteria accepted by `filterTopology()`. */
export interface TopologyFilter {
  tenant?: string;
  site?: string;
  layer?: string; // "Física" | "L2" | "BGP" | "DWDM" | "Serviço"
  status?: string;
  origin?: string;
  nodeType?: string;
  search?: string;
}

/** Payload accepted by `topologyService.createManualLink()`. */
export interface CreateManualLinkInput {
  tenantId?: string;
  siteId?: string;
  fromNodeId: string;
  toNodeId: string;
  fromHandleId?: string | null;
  toHandleId?: string | null;
  edgeType: EdgeType;
  fromInterfaceId?: string | null;
  toInterfaceId?: string | null;
  capacityMbps?: number;
  status?: NodeStatus;
  planned?: boolean;
  metadata?: Record<string, unknown>;
}

/** Payload accepted by `topologyService.saveLayout()`. */
export interface SaveLayoutInput {
  tenantId?: string;
  siteId?: string;
  id?: number;
  name?: string;
  devices: DeviceData[];
  links: LinkData[];
  positions: Record<string, TopologyPosition>;
  setActive?: boolean;
}

/** Payload accepted by `topologyService.updateLink()`. */
export interface UpdateLinkInput {
  linkId: string;
  intfA?: string;
  intfB?: string;
}

/** Discovery run summary returned by `runDiscovery()`. */
export interface DiscoveryResult {
  snapshotId: string;
  nodeCount: number;
  edgeCount: number;
  changes: number;
  startedAt: string;
  finishedAt: string;
}
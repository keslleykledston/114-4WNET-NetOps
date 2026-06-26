/**
 * Pure utility functions for the Network Map module.
 *
 * These helpers do not touch React, the canvas, or the service layer —
 * they operate on plain data so they remain trivially unit-testable and
 * reusable from both the UI and the (future) backend integration.
 */

import type { CSSProperties } from "react";
import type { DeviceData, EdgeType as UiEdgeType, LinkData, NodeStatus } from "./types";
import type {
  SnapshotDiff,
  TopologyEdge,
  TopologyFilter,
  TopologyGraph,
  TopologyStats,
} from "./topology.types";
import { edgeStyle as baseEdgeStyle } from "@/components/network-map/edge-styles";

const LAYER_TO_EDGE: Record<string, UiEdgeType[]> = {
  Física: ["physical", "lag"],
  L2: ["physical", "lag", "service"],
  BGP: ["bgp"],
  DWDM: ["optical"],
  Serviço: ["service"],
};

const ORIGIN_LABEL_TO_KEY: Record<string, LinkData["origin"]> = {
  Descoberto: "discovered",
  Manual: "manual",
  Planejado: "planned",
  NetBox: "netbox",
  Zabbix: "zabbix",
  "Banco interno": "database",
};

/** Filters devices + links together so dangling edges are dropped. */
export function filterTopology(
  devices: DeviceData[],
  links: LinkData[],
  filter: TopologyFilter,
): { devices: DeviceData[]; links: LinkData[] } {
  const q = filter.search?.trim().toLowerCase() ?? "";

  const visibleDevices = devices.filter((d) => {
    if (filter.tenant && filter.tenant !== "all" && d.tenant !== filter.tenant) return false;
    if (filter.site && filter.site !== "all" && d.site !== filter.site) return false;
    if (filter.status && filter.status !== "all" && d.status !== filter.status) return false;
    if (filter.nodeType && filter.nodeType !== "all" && d.type !== filter.nodeType) return false;
    if (q && !`${d.name} ${d.site} ${d.role} ${d.vendor}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const visibleIds = new Set(visibleDevices.map((d) => d.id));

  const visibleLinks = links.filter((l) => {
    if (!visibleIds.has(l.source) || !visibleIds.has(l.target)) return false;
    if (filter.layer && filter.layer !== "all") {
      const allowed = LAYER_TO_EDGE[filter.layer] ?? [];
      if (!allowed.includes(l.edgeType)) return false;
    }
    if (filter.status && filter.status !== "all" && l.status !== filter.status) return false;
    if (filter.origin && filter.origin !== "all") {
      const key = ORIGIN_LABEL_TO_KEY[filter.origin];
      if (key && l.origin !== key) return false;
    }
    return true;
  });

  return { devices: visibleDevices, links: visibleLinks };
}

/** Tailwind color token for a node status (used by legends, mini-map, badges). */
export function getNodeStatusColor(status: NodeStatus): string {
  switch (status) {
    case "UP":
      return "#10b981";
    case "DOWN":
      return "#ef4444";
    case "PARTIAL":
      return "#f59e0b";
    case "PLANNED":
      return "#38bdf8";
    default:
      return "#71717a";
  }
}

/** Thin re-export so all edge styling flows through the utils layer. */
export function getEdgeStyle(edgeType: UiEdgeType, status: NodeStatus): CSSProperties {
  return baseEdgeStyle(edgeType, status);
}

/** All links touching a node, optionally filtered by edge type. */
export function getConnectedEdges(
  nodeId: string,
  links: LinkData[],
  edgeType?: UiEdgeType,
): LinkData[] {
  return links.filter(
    (l) =>
      (l.source === nodeId || l.target === nodeId) &&
      (edgeType ? l.edgeType === edgeType : true),
  );
}

/** Aggregate counts for the header / toolbar. */
export function buildTopologyStats(devices: DeviceData[], links: LinkData[]): TopologyStats {
  const byStatus: TopologyStats["byStatus"] = {
    UP: 0,
    DOWN: 0,
    PARTIAL: 0,
    UNKNOWN: 0,
    PLANNED: 0,
  };
  const byEdgeType: TopologyStats["byEdgeType"] = {
    physical: 0,
    lag: 0,
    bgp: 0,
    service: 0,
    optical: 0,
    planned: 0,
    manual: 0,
  };
  let alarms = 0;

  for (const d of devices) {
    byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
    alarms += d.alarms ?? 0;
  }
  for (const l of links) {
    byEdgeType[l.edgeType] = (byEdgeType[l.edgeType] ?? 0) + 1;
  }

  return {
    nodeCount: devices.length,
    edgeCount: links.length,
    byStatus,
    byEdgeType,
    alarms,
  };
}

/** Pure diff between two topology graphs (used to render snapshot comparisons). */
export function createSnapshotDiff(
  before: TopologyGraph,
  after: TopologyGraph,
  fromSnapshotId = "previous",
  toSnapshotId = "current",
): SnapshotDiff {
  const beforeNodeIds = new Set(before.nodes.map((n) => n.id));
  const afterNodeIds = new Set(after.nodes.map((n) => n.id));
  const beforeEdges = new Map(before.edges.map((e) => [e.id, e] as const));
  const afterEdges = new Map(after.edges.map((e) => [e.id, e] as const));

  const addedNodes = [...afterNodeIds].filter((id) => !beforeNodeIds.has(id));
  const removedNodes = [...beforeNodeIds].filter((id) => !afterNodeIds.has(id));
  const addedEdges = [...afterEdges.keys()].filter((id) => !beforeEdges.has(id));
  const removedEdges = [...beforeEdges.keys()].filter((id) => !afterEdges.has(id));

  const changedEdges: SnapshotDiff["changedEdges"] = [];
  for (const [id, after_] of afterEdges) {
    const before_ = beforeEdges.get(id);
    if (!before_) continue;
    const changed = (Object.keys(after_) as Array<keyof TopologyEdge>).some(
      (k) => JSON.stringify(after_[k]) !== JSON.stringify(before_[k]),
    );
    if (changed) changedEdges.push({ id, before: before_, after: after_ });
  }

  return {
    fromSnapshotId,
    toSnapshotId,
    addedNodes,
    removedNodes,
    addedEdges,
    removedEdges,
    changedEdges,
  };
}
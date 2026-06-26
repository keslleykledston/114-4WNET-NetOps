import type { DeviceData, LinkData } from "./types";
import type {
  CreateManualLinkInput,
  DiscoveryResult,
  SaveLayoutInput,
  SnapshotDiff,
  TopologySnapshot,
  UpdateLinkInput,
} from "./topology.types";
import {
  activateMapLayout,
  fetchActiveMapLayout,
  fetchMapLayout,
  fetchMapLayouts,
  saveMapLayout,
} from "@/features/topology/topology-api";

const _snapshots: TopologySnapshot[] = [
  {
    id: "snap-prev",
    tenantId: "4WNET",
    siteId: "all",
    collectedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    nodeCount: 0,
    edgeCount: 0,
    statusSummary: { UP: 0, DOWN: 0, PARTIAL: 0, UNKNOWN: 0, PLANNED: 0 },
    diffSummary: { addedNodes: 0, removedNodes: 0, addedEdges: 0, removedEdges: 0, changedEdges: 0 },
  },
  {
    id: "snap-current",
    tenantId: "4WNET",
    siteId: "all",
    collectedAt: new Date().toISOString(),
    nodeCount: 0,
    edgeCount: 0,
    statusSummary: { UP: 0, DOWN: 0, PARTIAL: 0, UNKNOWN: 0, PLANNED: 0 },
    diffSummary: { addedNodes: 0, removedNodes: 0, addedEdges: 0, removedEdges: 0, changedEdges: 0 },
  },
];

export interface GetTopologyResult {
  devices: DeviceData[];
  links: LinkData[];
  positions: Record<string, { x: number; y: number }>;
  snapshot: TopologySnapshot;
  layoutId?: number | null;
  layoutName?: string | null;
}

export type MapLayoutSummary = {
  id: number;
  name: string;
  isActive: boolean;
  updatedAt: string;
  createdAt: string;
};

function emptySnapshot(): TopologySnapshot {
  return {
    id: "snap-current",
    tenantId: "4WNET",
    siteId: "all",
    collectedAt: new Date().toISOString(),
    nodeCount: 0,
    edgeCount: 0,
    statusSummary: { UP: 0, DOWN: 0, PARTIAL: 0, UNKNOWN: 0, PLANNED: 0 },
    diffSummary: { addedNodes: 0, removedNodes: 0, addedEdges: 0, removedEdges: 0, changedEdges: 0 },
  };
}

function snapshotFromPayload(
  devices: DeviceData[],
  links: LinkData[],
  layout?: { id: number; name: string; updatedAt: string } | null,
): TopologySnapshot {
  const statusSummary = { UP: 0, DOWN: 0, PARTIAL: 0, UNKNOWN: 0, PLANNED: 0 };
  for (const device of devices) {
    statusSummary[device.status] = (statusSummary[device.status] ?? 0) + 1;
  }
  return {
    id: layout ? `layout-${layout.id}` : "snap-current",
    tenantId: "4WNET",
    siteId: "all",
    collectedAt: layout?.updatedAt ?? new Date().toISOString(),
    nodeCount: devices.length,
    edgeCount: links.length,
    statusSummary,
    diffSummary: { addedNodes: 0, removedNodes: 0, addedEdges: 0, removedEdges: 0, changedEdges: 0 },
  };
}

export const topologyService = {
  async getTopology(_params?: { tenantId?: string; siteId?: string }): Promise<GetTopologyResult> {
    const active = await fetchActiveMapLayout();
    if (!active) {
      return {
        devices: [],
        links: [],
        positions: {},
        snapshot: emptySnapshot(),
        layoutId: null,
        layoutName: null,
      };
    }
    const devices = (active.payload.devices ?? []) as DeviceData[];
    const links = (active.payload.links ?? []) as LinkData[];
    const positions = active.payload.positions ?? {};
    return {
      devices,
      links,
      positions,
      snapshot: snapshotFromPayload(devices, links, active),
      layoutId: active.id,
      layoutName: active.name,
    };
  },

  async listLayouts(): Promise<MapLayoutSummary[]> {
    return fetchMapLayouts();
  },

  async loadLayout(id: number): Promise<GetTopologyResult> {
    const layout = await fetchMapLayout(id);
    const devices = (layout.payload.devices ?? []) as DeviceData[];
    const links = (layout.payload.links ?? []) as LinkData[];
    const positions = layout.payload.positions ?? {};
    await activateMapLayout(id);
    return {
      devices,
      links,
      positions,
      snapshot: snapshotFromPayload(devices, links, layout),
      layoutId: layout.id,
      layoutName: layout.name,
    };
  },

  async runDiscovery(_params?: { tenantId?: string; siteId?: string }): Promise<DiscoveryResult> {
    const startedAt = new Date().toISOString();
    const current = await this.getTopology();
    const finishedAt = new Date().toISOString();
    return {
      snapshotId: `snap-${Date.now()}`,
      nodeCount: current.devices.length,
      edgeCount: current.links.length,
      changes: 0,
      startedAt,
      finishedAt,
    };
  },

  async saveLayout(input: SaveLayoutInput): Promise<{ ok: true; savedAt: string; layoutId: number; layoutName: string }> {
    const layout = await saveMapLayout({
      id: input.id,
      name: input.name ?? "Layout principal",
      devices: input.devices,
      links: input.links,
      positions: input.positions,
      setActive: input.setActive ?? true,
    });
    return {
      ok: true,
      savedAt: layout.updatedAt,
      layoutId: layout.id,
      layoutName: layout.name,
    };
  },

  async createManualLink(input: CreateManualLinkInput): Promise<LinkData> {
    return {
      id: `m-${Date.now()}`,
      source: input.fromNodeId,
      target: input.toNodeId,
      sourceHandle: input.fromHandleId ?? undefined,
      targetHandle: input.toHandleId ?? undefined,
      edgeType: input.edgeType,
      intfA: input.fromInterfaceId ?? "—",
      intfB: input.toInterfaceId ?? "—",
      capacity: input.capacityMbps ? `${input.capacityMbps / 1000}G` : "1G",
      status: input.status ?? (input.planned ? "PLANNED" : "UP"),
      origin: input.planned ? "planned" : "manual",
      confidence: input.planned ? 50 : 60,
    };
  },

  async updateLinkInterface(
    current: LinkData,
    side: "source" | "target",
    interfaceName: string,
  ): Promise<LinkData> {
    const link = { ...current };
    if (side === "source") link.intfA = interfaceName;
    else link.intfB = interfaceName;
    return link;
  },

  async updateLink(current: LinkData, input: UpdateLinkInput): Promise<LinkData> {
    return {
      ...current,
      intfA: input.intfA ?? current.intfA,
      intfB: input.intfB ?? current.intfB,
    };
  },

  async deleteManualLink(linkId: string, links: LinkData[]): Promise<LinkData[]> {
    return links.filter(
      (l) => !(l.id === linkId && (l.origin === "manual" || l.origin === "planned")),
    );
  },

  async getSnapshots(_params?: { tenantId?: string; siteId?: string; limit?: number }): Promise<TopologySnapshot[]> {
    return [..._snapshots];
  },

  async compareSnapshots(fromId: string, toId: string): Promise<SnapshotDiff> {
    return {
      fromSnapshotId: fromId,
      toSnapshotId: toId,
      addedNodes: [],
      removedNodes: [],
      addedEdges: [],
      removedEdges: [],
      changedEdges: [],
    };
  },
};

export type TopologyService = typeof topologyService;

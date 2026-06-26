import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type Node,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { toast } from "sonner";
import {
  Activity,
  Cable,
  Crosshair,
  Download,
  Eraser,
  GitCompare,
  Grid3x3,
  LayoutGrid,
  MousePointer2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Wand2,
  Pencil,
  Eye,
  Boxes,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";

import {
  SITES,
  TENANTS,
  LAYERS,
  STATUSES,
  ORIGINS,
  DEVICE_TYPES,
} from "@/lib/network-map/mock-data";
import type {
  DeviceData,
  EdgeType,
  LinkData,
  LinkWaypoint,
  NodeStatus,
} from "@/lib/network-map/types";
import { edgePairOffset } from "@/lib/network-map/edge-routing";
import { topologyService, type MapLayoutSummary } from "@/lib/network-map/topologyService";
import { filterTopology, getNodeStatusColor } from "@/lib/network-map/utils";
import { mapInventoryDeviceToMapNode, parseInventoryNodeId } from "@/lib/network-map/inventory-bridge";
import { useListDevices } from "@workspace/api-client-react";
import { fetchLinkUtilization } from "@/features/topology/topology-api";
import { TopologyNode } from "@/components/network-map/TopologyNode";
import { TopologyEdge } from "@/components/network-map/TopologyEdge";
import { SiteGroupNode } from "@/components/network-map/SiteGroupNode";
import {
  EdgeDetailsPanel,
  EmptySelectionPanel,
  NodeDetailsPanel,
} from "@/components/network-map/SidePanels";
import {
  ManualLinkModal,
  type ManualLinkValues,
} from "@/components/network-map/ManualLinkModal";
import { LinkInterfaceModal } from "@/components/network-map/LinkInterfaceModal";
import { DiffDrawer } from "@/components/network-map/DiffDrawer";
import { DeviceStencilModal } from "@/components/network-map/device-stencils/DeviceStencilModal";
import { AddDeviceModal } from "@/components/network-map/AddDeviceModal";
import { SaveLayoutDialog } from "@/components/network-map/SaveLayoutDialog";

const nodeTypes = { device: TopologyNode, siteGroup: SiteGroupNode };
const edgeTypes = { topology: TopologyEdge };

function autoPosition(devices: DeviceData[]): Record<string, { x: number; y: number }> {
  // Cluster by site, then sort by role within each column
  const sites = Array.from(new Set(devices.map((d) => d.site)));
  const map: Record<string, { x: number; y: number }> = {};
  const COL_W = 340;
  const ROW_H = 120;
  sites.forEach((site, ci) => {
    const inSite = [...devices.filter((d) => d.site === site)].sort((a, b) =>
      a.role.localeCompare(b.role),
    );
    inSite.forEach((d, ri) => {
      map[d.id] = { x: 80 + ci * COL_W, y: 90 + ri * ROW_H };
    });
  });
  return map;
}

function buildEdge(l: LinkData): Edge {
  return {
    id: l.id,
    source: l.source,
    target: l.target,
    sourceHandle: l.sourceHandle ?? "right",
    targetHandle: l.targetHandle ?? "left",
    type: "topology",
    animated: l.status === "PARTIAL",
    data: l,
  };
}

function normalizeLinkHandles(link: LinkData): LinkData {
  return {
    ...link,
    sourceHandle: link.sourceHandle ?? "right",
    targetHandle: link.targetHandle ?? "left",
  };
}

function buildNode(d: DeviceData, pos: { x: number; y: number }, extra: any = {}): Node {
  return { id: d.id, type: "device", position: pos, data: { ...d, ...extra } };
}

function buildSiteGroupNodes(
  devices: DeviceData[],
  positions: Record<string, { x: number; y: number }>,
): Node[] {
  const sites = Array.from(new Set(devices.map((d) => d.site)));
  const NODE_W = 220;
  const NODE_H = 90;
  const PAD = 28;
  return sites
    .map((site) => {
      const inSite = devices.filter((d) => d.site === site);
      if (inSite.length === 0) return null;
      const xs = inSite.map((d) => positions[d.id]?.x ?? 0);
      const ys = inSite.map((d) => positions[d.id]?.y ?? 0);
      const minX = Math.min(...xs) - PAD;
      const minY = Math.min(...ys) - PAD - 14;
      const maxX = Math.max(...xs) + NODE_W + PAD;
      const maxY = Math.max(...ys) + NODE_H + PAD;
      return {
        id: `site-${site}`,
        type: "siteGroup",
        position: { x: minX, y: minY },
        data: { label: site, width: maxX - minX, height: maxY - minY },
        draggable: false,
        selectable: false,
        zIndex: -1,
        style: { zIndex: -1 },
      } as Node;
    })
    .filter(Boolean) as Node[];
}

function formatLayoutDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function NetworkMapPage() {
  return (
    <div className="dark flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <ReactFlowProvider>
        <NetworkMapInner />
      </ReactFlowProvider>
      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}

export default NetworkMapPage;

function NetworkMapInner() {
  const { data: inventoryDevices = [] } = useListDevices();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [links, setLinks] = useState<LinkData[]>([]);
  const [snapshot, setSnapshot] = useState<{ at: string; status: "Operacional" | "Atenção" | "Crítico" }>({
    at: "há 5 minutos",
    status: "Atenção",
  });
  const [groupBySite, setGroupBySite] = useState(false);
  const [savedLayouts, setSavedLayouts] = useState<MapLayoutSummary[]>([]);
  const [layoutId, setLayoutId] = useState<number | null>(null);
  const [layoutName, setLayoutName] = useState("Layout principal");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [addDeviceOpen, setAddDeviceOpen] = useState(false);
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);
  const [loadingTopology, setLoadingTopology] = useState(true);

  // Filters
  const [fTenant, setFTenant] = useState<string>("all");
  const [fSite, setFSite] = useState<string>("all");
  const [fLayer, setFLayer] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fOrigin, setFOrigin] = useState<string>("all");
  const [fType, setFType] = useState<string>("all");
  const [search, setSearch] = useState("");

  const positions = useRef<Record<string, { x: number; y: number }>>({});

  const refreshLayouts = useCallback(async () => {
    try {
      const layouts = await topologyService.listLayouts();
      setSavedLayouts(layouts);
    } catch (error) {
      console.error("Failed to list map layouts:", error);
      toast.error("Falha ao listar layouts salvos.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }, []);

  const applyTopology = useCallback((res: Awaited<ReturnType<typeof topologyService.getTopology>>) => {
    const realDevices = res.devices.filter((d) => !d.id.startsWith("device:pending-"));
    positions.current = { ...autoPosition(realDevices), ...res.positions };
    setDevices(realDevices);
    setLinks(res.links.map(normalizeLinkHandles));
    setLayoutId(res.layoutId ?? null);
    setLayoutName(res.layoutName ?? "Layout principal");
    setSnapshot({
      at: formatLayoutDate(res.snapshot.collectedAt),
      status: res.snapshot.statusSummary.DOWN > 0
        ? "Crítico"
        : res.snapshot.statusSummary.PARTIAL > 0
          ? "Atenção"
          : "Operacional",
    });
  }, []);

  // Initial load via persisted layout API.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [res] = await Promise.all([
          topologyService.getTopology(),
          refreshLayouts(),
        ]);
        if (cancelled) return;
        applyTopology(res);
      } catch (error) {
        console.error("Failed to load topology:", error);
        toast.error("Falha ao carregar layout do mapa.");
      } finally {
        if (!cancelled) setLoadingTopology(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyTopology, refreshLayouts]);

  const linkUtilKey = useMemo(
    () => links.map((l) => `${l.id}|${l.source}|${l.target}|${l.intfA}|${l.intfB}`).join(";"),
    [links],
  );

  useEffect(() => {
    const inventoryLinks = links.filter((l) => {
      const src = parseInventoryNodeId(l.source);
      const dst = parseInventoryNodeId(l.target);
      return src != null && dst != null && l.intfA && l.intfB && l.intfA !== "—" && l.intfB !== "—";
    });
    if (inventoryLinks.length === 0) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const payload = inventoryLinks.map((l) => ({
          linkId: l.id,
          sourceDeviceId: parseInventoryNodeId(l.source)!,
          intfA: l.intfA,
          targetDeviceId: parseInventoryNodeId(l.target)!,
          intfB: l.intfB,
        }));
        const results = await fetchLinkUtilization(payload);
        if (cancelled) return;
        const byId = new Map(results.map((r) => [r.linkId, r.utilizationPct]));
        setLinks((prev) => prev.map((l) => ({
          ...l,
          utilizationPct: byId.has(l.id) ? byId.get(l.id) ?? null : l.utilizationPct,
        })));
      } catch {
        // best-effort
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [linkUtilKey]);

  // Filtered subset (pure utility — centralized in lib/network-map/utils).
  const { devices: visibleDevices, links: visibleLinks } = useMemo(
    () =>
      filterTopology(devices, links, {
        tenant: fTenant,
        site: fSite,
        layer: fLayer,
        status: fStatus,
        origin: fOrigin,
        nodeType: fType,
        search,
      }),
    [devices, links, fTenant, fSite, fLayer, fStatus, fOrigin, fType, search],
  );

  // React Flow state derived
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  // Selection
  const [selectedNode, setSelectedNode] = useState<DeviceData | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<LinkData | null>(null);
  const [stencilDevice, setStencilDevice] = useState<DeviceData | null>(null);

  const openStencil = useCallback((d: DeviceData) => {
    setStencilDevice(d);
  }, []);

  const handleReplaceMapDevice = useCallback((oldDevice: DeviceData, newDevice: DeviceData) => {
    const pos = positions.current[oldDevice.id];
    if (pos) {
      positions.current[newDevice.id] = pos;
      delete positions.current[oldDevice.id];
    }
    setDevices((prev) => prev.filter((d) => d.id !== newDevice.id && d.id !== oldDevice.id).concat(newDevice));
    setLinks((prev) =>
      prev.map((l) => ({
        ...l,
        source: l.source === oldDevice.id ? newDevice.id : l.source,
        target: l.target === oldDevice.id ? newDevice.id : l.target,
      })),
    );
    setSelectedNode((n) => (n?.id === oldDevice.id ? newDevice : n));
    setStencilDevice((d) => (d?.id === oldDevice.id ? newDevice : d));
    toast.success(`${newDevice.name} substituiu ${oldDevice.name} no mapa.`);
  }, []);

  const handleRemoveMapDevice = useCallback((device: DeviceData) => {
    setDevices((prev) => prev.filter((d) => d.id !== device.id));
    setLinks((prev) => prev.filter((l) => l.source !== device.id && l.target !== device.id));
    delete positions.current[device.id];
    setSelectedNode((n) => (n?.id === device.id ? null : n));
    setStencilDevice((d) => (d?.id === device.id ? null : d));
    toast.success(`${device.name} removido do mapa.`);
  }, []);

  const handleWaypointChange = useCallback((edgeId: string, waypoints: LinkWaypoint[]) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === edgeId ? { ...l, waypoints } : l)),
    );
    setSelectedEdge((prev) =>
      prev?.id === edgeId ? { ...prev, waypoints } : prev,
    );
  }, []);

  useEffect(() => {
    // Compute connected sets for selection highlighting
    const linkCount: Record<string, number> = {};
    visibleLinks.forEach((l) => {
      linkCount[l.source] = (linkCount[l.source] ?? 0) + 1;
      linkCount[l.target] = (linkCount[l.target] ?? 0) + 1;
    });

    const selNodeId = selectedNode?.id;
    const selEdge = selectedEdge;
    const connectedEdgeIds = selNodeId
      ? new Set(
          visibleLinks
            .filter((l) => l.source === selNodeId || l.target === selNodeId)
            .map((l) => l.id),
        )
      : null;
    const highlightedNodeIds = selEdge
      ? new Set([selEdge.source, selEdge.target])
      : null;

    const deviceNodes = visibleDevices.map((d) =>
      buildNode(d, positions.current[d.id] ?? { x: 0, y: 0 }, {
        _linkCount: linkCount[d.id] ?? 0,
        _onOpenStencil: openStencil,
        _connectable: mode === "edit",
        _dimmed:
          (selNodeId
            ? d.id !== selNodeId &&
              !visibleLinks.some(
                (l) =>
                  (l.source === selNodeId && l.target === d.id) ||
                  (l.target === selNodeId && l.source === d.id),
              )
            : false) ||
          (highlightedNodeIds ? !highlightedNodeIds.has(d.id) : false),
        _highlighted: highlightedNodeIds?.has(d.id) ?? false,
      }),
    );
    const groupNodes = groupBySite ? buildSiteGroupNodes(visibleDevices, positions.current) : [];
    setNodes([...groupNodes, ...deviceNodes]);
    setEdges(
      visibleLinks.map((l) => {
        const e = buildEdge(l);
        const dimmed =
          (connectedEdgeIds && !connectedEdgeIds.has(l.id)) ||
          (selEdge && selEdge.id !== l.id);
        const highlighted =
          (connectedEdgeIds?.has(l.id) ?? false) || (selEdge?.id === l.id);
        return {
          ...e,
          selected: selEdge?.id === l.id,
          data: {
            ...l,
            _dimmed: !!dimmed,
            _highlighted: !!highlighted,
            _editMode: mode === "edit",
            _edgeOffset: edgePairOffset(l.id, visibleLinks),
            _onWaypointChange: handleWaypointChange,
          },
        };
      }),
    );
  }, [visibleDevices, visibleLinks, selectedNode, selectedEdge, groupBySite, mode, openStencil, handleWaypointChange, setNodes, setEdges]);

  const onNodeClick: NodeMouseHandler = useCallback((_, n) => {
    if (n.type === "siteGroup") return;
    setSelectedEdge(null);
    setSelectedNode((n.data as DeviceData) ?? null);
  }, []);
  const onEdgeClick: EdgeMouseHandler = useCallback((_, e) => {
    setSelectedNode(null);
    setSelectedEdge((e.data as LinkData) ?? null);
  }, []);
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  // Node drag persistence
  const onNodeDragStop = useCallback((_: any, n: Node) => {
    positions.current[n.id] = n.position;
  }, []);

  // Connect (edit mode only)
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [plannedLink, setPlannedLink] = useState(false);
  const [connectDraft, setConnectDraft] = useState<{
    source?: string;
    target?: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>({});

  const onConnect = useCallback((c: Connection) => {
    if (mode !== "edit") return;
    setConnectDraft({
      source: c.source ?? undefined,
      target: c.target ?? undefined,
      sourceHandle: c.sourceHandle ?? undefined,
      targetHandle: c.targetHandle ?? undefined,
    });
    setPlannedLink(false);
    setLinkModalOpen(true);
  }, [mode]);

  const handleManualLink = async (v: ManualLinkValues) => {
    setDevices((prev) => {
      let next = [...prev];
      for (const nodeId of [v.source, v.target]) {
        const deviceId = parseInventoryNodeId(nodeId);
        if (deviceId == null || next.some((d) => d.id === nodeId)) continue;
        const inv = inventoryDevices.find((d) => d.id === deviceId);
        if (!inv) continue;
        next.push(mapInventoryDeviceToMapNode(inv));
      }
      if (next.length !== prev.length) {
        positions.current = { ...autoPosition(next), ...positions.current };
      }
      return next;
    });

    const mbpsMatch = v.capacity.match(/(\d+(?:\.\d+)?)\s*(G|M)/i);
    const capacityMbps = mbpsMatch
      ? mbpsMatch[2].toUpperCase() === "G"
        ? parseFloat(mbpsMatch[1]) * 1000
        : parseFloat(mbpsMatch[1])
      : 1000;
    const created = await topologyService.createManualLink({
      fromNodeId: v.source,
      toNodeId: v.target,
      fromHandleId: connectDraft.sourceHandle ?? null,
      toHandleId: connectDraft.targetHandle ?? null,
      edgeType: v.edgeType,
      fromInterfaceId: v.intfA || null,
      toInterfaceId: v.intfB || null,
      capacityMbps,
      status: v.status,
      planned: plannedLink,
    });
    // Preserve the user-typed capacity label in the UI.
    setLinks((prev) => [
      ...prev,
      normalizeLinkHandles({
        ...created,
        capacity: v.capacity,
        sourceHandle: connectDraft.sourceHandle ?? created.sourceHandle,
        targetHandle: connectDraft.targetHandle ?? created.targetHandle,
      }),
    ]);
    toast.success(plannedLink ? "Link planejado adicionado" : "Link manual adicionado", {
      description: "Alteração apenas visual/manual. Não altera a rede real.",
    });
  };

  // Toolbar actions
  const [discovering, setDiscovering] = useState(false);
  const refreshDiscovery = async () => {
    setDiscovering(true);
    try {
      const res = await topologyService.runDiscovery();
      setSnapshot({ at: "agora", status: "Atenção" });
      toast.success("Descoberta concluída", {
        description: `${res.nodeCount} nós, ${res.edgeCount} links, ${res.changes} mudanças detectadas.`,
      });
    } finally {
      setDiscovering(false);
    }
  };

  const saveLayout = async (name: string) => {
    setSavingLayout(true);
    try {
      const persistedDevices = devices.filter((d) => !d.id.startsWith("device:pending-"));
      const positionsPayload: Record<string, { x: number; y: number }> = {};
      for (const device of persistedDevices) {
        const node = nodes.find((n) => n.id === device.id);
        const fromNode = node?.position;
        const fromRef = positions.current[device.id];
        if (fromNode) {
          positionsPayload[device.id] = fromNode;
          positions.current[device.id] = fromNode;
        } else if (fromRef) {
          positionsPayload[device.id] = fromRef;
        }
      }
      const result = await topologyService.saveLayout({
        id: layoutId ?? undefined,
        name,
        devices: persistedDevices,
        links,
        positions: positionsPayload,
      });
      setLayoutId(result.layoutId);
      setLayoutName(result.layoutName);
      await refreshLayouts();
      setSaveDialogOpen(false);
      toast.success("Layout salvo com sucesso.", {
        description: `${result.layoutName} — ${persistedDevices.length} nós, ${links.length} links.`,
      });
    } catch (error) {
      console.error("Failed to save map layout:", error);
      toast.error("Falha ao salvar layout.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSavingLayout(false);
    }
  };

  const loadLayout = async (id: number) => {
    try {
      const res = await topologyService.loadLayout(id);
      applyTopology(res);
      setSelectedNode(null);
      setSelectedEdge(null);
      await refreshLayouts();
      toast.success(`Layout "${res.layoutName}" carregado.`);
      setTimeout(() => rfInstance?.fitView({ duration: 400, padding: 0.15 }), 50);
    } catch (error) {
      console.error("Failed to load map layout:", error);
      toast.error("Falha ao carregar layout.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleAddDeviceClick = () => {
    const center = rfInstance?.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }) ?? { x: 240, y: 180 };
    const pendingId = `device:pending-${Date.now()}`;
    const placeholder: DeviceData = {
      id: pendingId,
      name: "Novo device",
      type: "router",
      vendor: "—",
      role: "network",
      site: "—",
      tenant: "4WNET",
      status: "UNKNOWN",
    };
    positions.current[pendingId] = center;
    setDevices((prev) => [...prev, placeholder]);
    setPendingDeviceId(pendingId);
    setAddDeviceOpen(true);
  };

  const handleAddDeviceConfirm = (device: DeviceData, connectToNeighborId?: string) => {
    if (pendingDeviceId) {
      const pos = positions.current[pendingDeviceId];
      delete positions.current[pendingDeviceId];
      if (pos) positions.current[device.id] = pos;
    } else if (!positions.current[device.id]) {
      const center = rfInstance?.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }) ?? { x: 240, y: 180 };
      positions.current[device.id] = center;
    }
    setDevices((prev) => {
      const next = prev.filter((d) => d.id !== pendingDeviceId && d.id !== device.id);
      return [...next, device];
    });
    setPendingDeviceId(null);
    setSelectedNode(device);
    toast.success(`${device.name} adicionado ao mapa.`);
    if (connectToNeighborId) {
      setConnectDraft({ source: device.id, target: connectToNeighborId });
      setPlannedLink(false);
      setLinkModalOpen(true);
    }
  };

  const cancelPendingDevice = () => {
    if (pendingDeviceId) {
      setDevices((prev) => prev.filter((d) => d.id !== pendingDeviceId));
      delete positions.current[pendingDeviceId];
      setPendingDeviceId(null);
    }
  };

  const autoLayout = () => {
    positions.current = autoPosition(visibleDevices);
    // trigger rebuild
    setSelectedNode((s) => s);
    setSelectedEdge((s) => s);
    setNodes(visibleDevices.map((d) => buildNode(d, positions.current[d.id])));
    setTimeout(() => rfInstance?.fitView({ duration: 400, padding: 0.15 }), 50);
    toast.success("Layout reorganizado por site e role.");
  };

  const centerMap = () => {
    rfInstance?.fitView({ duration: 500, padding: 0.15 });
    toast("Mapa centralizado.");
  };

  const toggleGroupBySite = () => {
    setGroupBySite((v) => {
      const next = !v;
      toast(next ? "Agrupamento por site ativado." : "Agrupamento por site desativado.");
      return next;
    });
  };

  const clearSelection = () => { setSelectedEdge(null); setSelectedNode(null); };

  const [diffOpen, setDiffOpen] = useState(false);

  const statusBadgeColor =
    snapshot.status === "Operacional"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : snapshot.status === "Atenção"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : "bg-red-500/15 text-red-400 border-red-500/30";

  if (loadingTopology) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-sm text-zinc-400">
        Carregando mapa...
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      {/* HEADER */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/60 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-sky-500/30 to-violet-500/30 text-sky-300">
            <Boxes className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-zinc-100">Mapa de Rede</h1>
            <p className="text-xs text-zinc-400">Topologia física, lógica e serviços da rede</p>
          </div>
          <Separator orientation="vertical" className="h-8 bg-zinc-800" />
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-[10px] text-zinc-300">
              Última coleta: {snapshot.at}
            </Badge>
            <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-[10px] text-zinc-300">
              {visibleDevices.length} nós
            </Badge>
            <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-[10px] text-zinc-300">
              {visibleLinks.length} links
            </Badge>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeColor}`}>
              {snapshot.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={refreshDiscovery} disabled={discovering}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800">
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${discovering ? "animate-spin" : ""}`} />
            Atualizar descoberta
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline"
                className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800">
                <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
                {layoutName}
                <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-zinc-800 bg-zinc-950 text-zinc-100">
              <DropdownMenuLabel className="text-xs text-zinc-400">Layouts salvos</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-zinc-800" />
              {savedLayouts.length === 0 ? (
                <DropdownMenuItem disabled className="text-zinc-500">
                  Nenhum layout salvo
                </DropdownMenuItem>
              ) : (
                savedLayouts.map((layout) => (
                  <DropdownMenuItem
                    key={layout.id}
                    onClick={() => void loadLayout(layout.id)}
                    className={layout.id === layoutId ? "bg-sky-500/10 text-sky-200" : undefined}
                  >
                    <span className="font-medium">{layout.name}</span>
                    <span className="ml-2 text-[10px] text-zinc-500">
                      {formatLayoutDate(layout.updatedAt)}
                    </span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" onClick={() => setSaveDialogOpen(true)}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800">
            <Save className="mr-1.5 h-3.5 w-3.5" /> Salvar layout
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDiffOpen(true)}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800">
            <GitCompare className="mr-1.5 h-3.5 w-3.5" /> Comparar snapshots
          </Button>
          <Button size="sm" variant="outline" onClick={() => toast("Export gerado (mock).")}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800">
            <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar
          </Button>
          <div className="ml-1 flex items-center gap-0 rounded-md border border-zinc-700 bg-zinc-900 p-0.5">
            <Toggle
              size="sm"
              pressed={mode === "view"}
              onPressedChange={() => setMode("view")}
              className="data-[state=on]:bg-zinc-800 data-[state=on]:text-zinc-100 text-zinc-400"
            >
              <Eye className="mr-1 h-3.5 w-3.5" /> Visualização
            </Toggle>
            <Toggle
              size="sm"
              pressed={mode === "edit"}
              onPressedChange={() => setMode("edit")}
              className="data-[state=on]:bg-sky-500/20 data-[state=on]:text-sky-300 text-zinc-400"
            >
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edição
            </Toggle>
          </div>
        </div>
      </header>

      {/* FILTERS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950/80 px-4 py-2">
        <FilterSelect label="Tenant" value={fTenant} onChange={setFTenant} options={TENANTS} />
        <FilterSelect label="Site" value={fSite} onChange={setFSite} options={SITES} />
        <FilterSelect label="Camada" value={fLayer} onChange={setFLayer} options={LAYERS} />
        <FilterSelect label="Status" value={fStatus} onChange={setFStatus} options={STATUSES} />
        <FilterSelect label="Origem" value={fOrigin} onChange={setFOrigin} options={ORIGINS} />
        <FilterSelect label="Tipo" value={fType} onChange={setFType} options={DEVICE_TYPES} />
        <div className="relative ml-auto w-64">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nodes (ex: BVA, NE8000, Huawei)..."
            className="h-8 border-zinc-800 bg-zinc-900 pl-7 text-xs text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
      </div>

      {/* MAIN */}
      <div className="flex min-h-0 flex-1">
        {/* LEFT TOOLBAR */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/60 p-3 lg:flex">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Ferramentas</div>
          <div className="mt-2 grid grid-cols-1 gap-1.5">
            <ToolBtn icon={<MousePointer2 className="h-3.5 w-3.5" />} label="Selecionar" onClick={clearSelection} />
            <ToolBtn icon={<Plus className="h-3.5 w-3.5" />} label="Adicionar device"
              disabled={mode !== "edit"}
              onClick={handleAddDeviceClick} />
            <ToolBtn icon={<Cable className="h-3.5 w-3.5" />} label="Criar link"
              disabled={mode !== "edit"}
              onClick={() => { setPlannedLink(false); setConnectDraft({}); setLinkModalOpen(true); }} />
            <ToolBtn icon={<Cable className="h-3.5 w-3.5" />} label="Criar link planejado"
              disabled={mode !== "edit"}
              onClick={() => { setPlannedLink(true); setConnectDraft({}); setLinkModalOpen(true); }} />
            <ToolBtn
              icon={<LayoutGrid className="h-3.5 w-3.5" />}
              label={groupBySite ? "Desagrupar sites" : "Agrupar por site"}
              onClick={toggleGroupBySite}
              active={groupBySite}
            />
            <ToolBtn icon={<Wand2 className="h-3.5 w-3.5" />} label="Auto layout" onClick={autoLayout} />
            <ToolBtn icon={<Crosshair className="h-3.5 w-3.5" />} label="Centralizar" onClick={centerMap} />
            <ToolBtn icon={<Eraser className="h-3.5 w-3.5" />} label="Limpar seleção" onClick={clearSelection} />
          </div>

          <Separator className="my-4 bg-zinc-800" />

          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Legenda</div>
          <div className="mt-2 space-y-1.5 text-[11px] text-zinc-300">
            <LegendItem color="bg-emerald-500" label="UP" />
            <LegendItem color="bg-red-500" label="DOWN" />
            <LegendItem color="bg-amber-500" label="PARTIAL" />
            <LegendItem color="bg-zinc-500" label="UNKNOWN" />
            <LegendItem color="bg-sky-500" label="PLANNED (tracejado)" />
            <LegendItem color="bg-violet-400" label="BGP / Serviço" />
            <LegendItem color="bg-orange-400" label="DWDM / Optical" />
          </div>

          <Separator className="my-4 bg-zinc-800" />

          <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2 text-[11px] text-zinc-400">
            <Activity className="mb-1 inline h-3 w-3 text-emerald-400" /> Modo:{" "}
            <span className="font-medium text-zinc-200">{mode === "view" ? "Visualização" : "Edição"}</span>
          </div>
        </aside>

        {/* CANVAS */}
        <div className="relative min-w-0 flex-1">
          {visibleDevices.length === 0 ? (
            <EmptyState onRefresh={refreshDiscovery} onPlanned={() => { setPlannedLink(true); setLinkModalOpen(true); }} />
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              connectionMode={mode === "edit" ? ConnectionMode.Loose : ConnectionMode.Strict}
              onNodesChange={mode === "edit" ? onNodesChange : (changes) =>
                onNodesChange(changes.filter((c) => c.type === "select" || c.type === "dimensions"))}
              onEdgesChange={(changes) => {
                const safe = changes.filter((c) => c.type !== "remove");
                if (safe.length > 0) onEdgesChange(safe);
              }}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              onNodeDragStop={onNodeDragStop}
              onInit={setRfInstance}
              nodesDraggable={mode === "edit"}
              nodesConnectable={mode === "edit"}
              edgesUpdatable={false}
              fitView
              proOptions={{ hideAttribution: true }}
              className="bg-zinc-950"
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
              <MiniMap
                pannable zoomable
                maskColor="rgba(9,9,11,0.85)"
                style={{ background: "#09090b", border: "1px solid #27272a" }}
              nodeColor={(n) =>
                  getNodeStatusColor(((n.data as DeviceData)?.status ?? "UNKNOWN") as NodeStatus)
                }
              />
              <Controls className="!border-zinc-700 !bg-zinc-900 [&_button]:!border-zinc-700 [&_button]:!bg-zinc-900 [&_button]:!text-zinc-200" />
            </ReactFlow>
          )}

          {mode === "edit" && (
            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-300">
              Modo edição — ligue pelos conectores do device; arraste as âncoras verde/roxo nas pontas da linha (não a etiqueta de velocidade).
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <aside className="hidden w-[340px] shrink-0 border-l border-zinc-800 bg-zinc-950/60 md:block">
          {selectedNode ? (
            <NodeDetailsPanel device={selectedNode} links={links} devices={devices} />
          ) : selectedEdge ? (
            <EdgeDetailsPanel link={selectedEdge} devices={devices} />
          ) : (
            <EmptySelectionPanel devices={visibleDevices} links={visibleLinks} />
          )}
        </aside>
      </div>

      <LinkInterfaceModal
        link={selectedEdge}
        devices={devices}
        inventoryDevices={inventoryDevices}
        links={links}
        onOpenChange={(o) => { if (!o) setSelectedEdge(null); }}
        onLinkUpdated={(updated) => {
          setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
          setSelectedEdge(updated);
        }}
      />
      <ManualLinkModal
        open={linkModalOpen}
        onOpenChange={setLinkModalOpen}
        links={links}
        planned={plannedLink}
        onConfirm={handleManualLink}
        initialSource={connectDraft.source}
        initialTarget={connectDraft.target}
      />
      <DiffDrawer open={diffOpen} onOpenChange={setDiffOpen} />
      <DeviceStencilModal
        device={stencilDevice}
        onOpenChange={(o) => !o && setStencilDevice(null)}
        mapEditMode={mode === "edit"}
        mapDevices={devices}
        onReplaceDevice={handleReplaceMapDevice}
        onDeleteDevice={handleRemoveMapDevice}
      />
      <SaveLayoutDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        initialName={layoutName}
        onSave={(name) => void saveLayout(name)}
        saving={savingLayout}
      />
      <AddDeviceModal
        open={addDeviceOpen}
        onOpenChange={(open) => {
          if (!open) cancelPendingDevice();
          setAddDeviceOpen(open);
        }}
        mapDevices={devices}
        onConfirm={handleAddDeviceConfirm}
      />
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[120px] border-zinc-800 bg-zinc-900 text-xs text-zinc-200">
        <span className="mr-1 text-zinc-500">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ToolBtn({
  icon, label, onClick, disabled, active,
}: { icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-sky-500/50 bg-sky-500/10 text-sky-200"
          : "border-zinc-800 bg-zinc-900/50"
      }`}
    >
      <span className="text-zinc-400 group-hover:text-zinc-200">{icon}</span>
      {label}
    </button>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}

function EmptyState({ onRefresh, onPlanned }: { onRefresh: () => void; onPlanned: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-lg border border-zinc-800 bg-zinc-900/60 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-zinc-800 text-zinc-400">
          <Grid3x3 className="h-5 w-5" />
        </div>
        <h3 className="text-base font-semibold text-zinc-100">Nenhuma topologia encontrada</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Ative o modo edição para adicionar devices e links manualmente no mapa.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button size="sm" onClick={onRefresh}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar descoberta
          </Button>
          <Button size="sm" variant="outline" onClick={onPlanned}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800">
            <Cable className="mr-1.5 h-3.5 w-3.5" /> Criar link planejado
          </Button>
        </div>
      </div>
    </div>
  );
}
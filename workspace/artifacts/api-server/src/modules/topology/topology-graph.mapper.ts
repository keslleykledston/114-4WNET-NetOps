import type { TopologyEdge, TopologyNode } from "@workspace/db";

export type LoomNodeStatus = "UP" | "DOWN" | "PARTIAL" | "UNKNOWN" | "PLANNED";
export type LoomDeviceType =
  | "router"
  | "switch"
  | "olt"
  | "dwdm"
  | "firewall"
  | "server"
  | "customer"
  | "bgp"
  | "site";
export type LoomEdgeType =
  | "physical"
  | "lag"
  | "bgp"
  | "service"
  | "optical"
  | "planned"
  | "manual";
export type LoomLinkOrigin =
  | "discovered"
  | "manual"
  | "planned"
  | "netbox"
  | "zabbix"
  | "database";

export interface LoomDeviceData {
  id: string;
  name: string;
  type: LoomDeviceType;
  vendor: string;
  model?: string;
  role: string;
  site: string;
  tenant: string;
  status: LoomNodeStatus;
  mgmtIp?: string;
  uptime?: string;
  interfaces?: number;
  alarms?: number;
  deviceId?: number;
}

export interface LoomLinkData {
  id: string;
  source: string;
  target: string;
  edgeType: LoomEdgeType;
  intfA: string;
  intfB: string;
  capacity: string;
  status: LoomNodeStatus;
  origin: LoomLinkOrigin;
  confidence: number;
  lastSeen?: string;
  label?: string;
}

export interface TopologyGraphPayload {
  devices: LoomDeviceData[];
  links: LoomLinkData[];
  nodes: LoomDeviceData[];
  edges: LoomLinkData[];
  generatedAt: string;
  stats: {
    nodeCount: number;
    edgeCount: number;
    deviceCount: number;
    linkCount: number;
  };
}

export interface DeviceIpIndex {
  id: number;
  ipAddress: string;
  hostname: string;
}

function meta(node: TopologyNode): Record<string, unknown> {
  return (node.metadataJson as Record<string, unknown>) ?? {};
}

function mapDeviceStatus(raw: unknown): LoomNodeStatus {
  const s = String(raw ?? "unknown").toLowerCase();
  if (s === "up" || s === "online" || s === "active") return "UP";
  if (s === "down" || s === "offline") return "DOWN";
  if (s === "partial" || s === "degraded") return "PARTIAL";
  if (s === "planned") return "PLANNED";
  return "UNKNOWN";
}

function mapBgpState(raw: unknown): LoomNodeStatus {
  const s = String(raw ?? "unknown");
  if (s === "Established") return "UP";
  if (s === "Idle" || s === "Connect") return "DOWN";
  if (s === "Active" || s === "OpenSent" || s === "OpenConfirm") return "PARTIAL";
  return "UNKNOWN";
}

function inferDeviceType(vendor: string, platform: string, role: string | null): LoomDeviceType {
  const blob = `${vendor} ${platform} ${role ?? ""}`.toLowerCase();
  if (blob.includes("olt")) return "olt";
  if (blob.includes("firewall") || blob.includes("forti")) return "firewall";
  if (blob.includes("dwdm") || blob.includes("padtec") || blob.includes("optical")) return "dwdm";
  if (blob.includes("switch") || blob.includes("s6730") || blob.includes("ce68")) return "switch";
  if (blob.includes("core") || blob.includes("backbone") || blob.includes("ne8000") || blob.includes("router")) {
    return "router";
  }
  return "router";
}

function deviceKey(deviceId: number): string {
  return `device:${deviceId}`;
}

export function mapTopologyToGraph(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  deviceIndex: DeviceIpIndex[] = [],
): TopologyGraphPayload {
  const ipToDevice = new Map(deviceIndex.map((d) => [d.ipAddress, d]));
  const deviceNodes = nodes.filter((n) => n.nodeType === "DEVICE");
  const interfaceCountByDevice = new Map<number, number>();

  for (const n of nodes) {
    if (n.nodeType !== "INTERFACE") continue;
    const m = meta(n);
    const deviceId = Number(m.deviceId ?? n.refId);
    if (!Number.isFinite(deviceId)) continue;
    interfaceCountByDevice.set(deviceId, (interfaceCountByDevice.get(deviceId) ?? 0) + 1);
  }

  const devices: LoomDeviceData[] = deviceNodes.map((n) => {
    const m = meta(n);
    const deviceId = n.refId ?? 0;
    return {
      id: deviceKey(deviceId),
      deviceId,
      name: String(m.hostname ?? n.label),
      type: inferDeviceType(String(m.vendor ?? ""), String(m.platform ?? ""), (m.role as string) ?? null),
      vendor: String(m.vendor ?? "unknown"),
      model: m.platform ? String(m.platform) : undefined,
      role: String(m.role ?? "network"),
      site: String(m.site ?? "default"),
      tenant: "4WNET",
      status: mapDeviceStatus(m.status),
      mgmtIp: m.ipAddress ? String(m.ipAddress) : undefined,
      interfaces: interfaceCountByDevice.get(deviceId) ?? 0,
      alarms: 0,
    };
  });

  const deviceIdByNodeId = new Map<number, number>();
  for (const n of deviceNodes) {
    if (n.refId != null) deviceIdByNodeId.set(n.id, n.refId);
  }

  const bgpPeerNodes = nodes.filter((n) => n.nodeType === "BGP_PEER");
  const l2Nodes = nodes.filter((n) => n.nodeType === "L2_CIRCUIT");
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const links: LoomLinkData[] = [];
  const linkKeys = new Set<string>();

  const pushLink = (link: LoomLinkData) => {
    const key = `${link.source}|${link.target}|${link.edgeType}|${link.intfA}|${link.intfB}`;
    if (linkKeys.has(key)) return;
    linkKeys.add(key);
    links.push(link);
  };

  for (const peer of bgpPeerNodes) {
    const pm = meta(peer);
    const peerIp = String(pm.peerIp ?? "");
    const sourceDeviceId = Number(pm.deviceId ?? peer.refId);
    if (!peerIp || !Number.isFinite(sourceDeviceId)) continue;

    const remote = ipToDevice.get(peerIp);
    const sourceKey = deviceKey(sourceDeviceId);

    if (remote) {
      pushLink({
        id: `bgp-${sourceDeviceId}-${remote.id}-${peerIp}`,
        source: sourceKey,
        target: deviceKey(remote.id),
        edgeType: "bgp",
        intfA: peer.label,
        intfB: remote.hostname,
        capacity: "10G",
        status: mapBgpState(pm.state),
        origin: "database",
        confidence: 90,
      });
    } else {
      const extId = `bgp:${sourceDeviceId}:${peerIp}`;
      if (!devices.some((d) => d.id === extId)) {
        devices.push({
          id: extId,
          name: peer.label,
          type: "bgp",
          vendor: pm.remoteAs ? `AS${pm.remoteAs}` : "BGP",
          role: String(pm.role ?? "peer"),
          site: devices.find((d) => d.deviceId === sourceDeviceId)?.site ?? "external",
          tenant: "4WNET",
          status: mapBgpState(pm.state),
          mgmtIp: peerIp,
          interfaces: 1,
        });
      }
      pushLink({
        id: `bgp-ext-${sourceDeviceId}-${peerIp}`,
        source: sourceKey,
        target: extId,
        edgeType: "bgp",
        intfA: "local",
        intfB: peerIp,
        capacity: "10G",
        status: mapBgpState(pm.state),
        origin: "database",
        confidence: 80,
      });
    }
  }

  for (const edge of edges) {
    if (edge.edgeType !== "CONNECTED_TO") continue;
    const src = nodeById.get(edge.sourceNodeId);
    const tgt = nodeById.get(edge.targetNodeId);
    if (!src || !tgt || src.nodeType !== "L2_CIRCUIT" || tgt.nodeType !== "L2_CIRCUIT") continue;

    const sm = meta(src);
    const tm = meta(tgt);
    const srcDeviceId = Number(sm.deviceId);
    const tgtDeviceId = Number(tm.deviceId);
    if (!Number.isFinite(srcDeviceId) || !Number.isFinite(tgtDeviceId)) continue;

    pushLink({
      id: `l2-${src.refId}-${tgt.refId}`,
      source: deviceKey(srcDeviceId),
      target: deviceKey(tgtDeviceId),
      edgeType: "service",
      intfA: String(sm.localInterface ?? src.label),
      intfB: String(tm.localInterface ?? tgt.label),
      capacity: "1G",
      status: mapDeviceStatus(sm.operStatus ?? tm.operStatus),
      origin: "discovered",
      confidence: edge.confidence ?? 70,
      label: String(sm.vcId ?? tm.vcId ?? ""),
    });
  }

  for (const edge of edges) {
    if (edge.edgeType !== "HAS_BGP_PEER") continue;
    const srcDeviceId = deviceIdByNodeId.get(edge.sourceNodeId);
    const tgt = nodeById.get(edge.targetNodeId);
    if (!srcDeviceId || !tgt || tgt.nodeType !== "BGP_PEER") continue;
    const pm = meta(tgt);
    const peerIp = String(pm.peerIp ?? "");
    const remote = peerIp ? ipToDevice.get(peerIp) : undefined;
    if (!remote || remote.id === srcDeviceId) continue;
    pushLink({
      id: `bgp-edge-${edge.id}`,
      source: deviceKey(srcDeviceId),
      target: deviceKey(remote.id),
      edgeType: "bgp",
      intfA: peerIp,
      intfB: remote.hostname,
      capacity: "10G",
      status: mapBgpState(pm.state),
      origin: "database",
      confidence: edge.confidence ?? 90,
    });
  }

  void l2Nodes;

  const generatedAt = new Date().toISOString();
  return {
    devices,
    links,
    nodes: devices,
    edges: links,
    generatedAt,
    stats: {
      nodeCount: devices.length,
      edgeCount: links.length,
      deviceCount: devices.filter((d) => d.type !== "bgp").length,
      linkCount: links.length,
    },
  };
}

export function filterGraphByScope(
  graph: TopologyGraphPayload,
  scope: "global" | "site" | "device",
  scopeId?: number | string,
): TopologyGraphPayload {
  if (scope === "global" || scopeId == null) return graph;

  if (scope === "site") {
    const site = String(scopeId);
    const devices = graph.devices.filter((d) => d.site === site);
    const ids = new Set(devices.map((d) => d.id));
    const links = graph.links.filter((l) => ids.has(l.source) && ids.has(l.target));
    return { ...graph, devices, links, nodes: devices, edges: links, stats: { ...graph.stats, nodeCount: devices.length, edgeCount: links.length, deviceCount: devices.length, linkCount: links.length } };
  }

  const deviceKeyStr = deviceKey(Number(scopeId));
  const devices = graph.devices.filter((d) => d.id === deviceKeyStr || d.deviceId === Number(scopeId));
  const ids = new Set<string>([deviceKeyStr]);
  for (const l of graph.links) {
    if (l.source === deviceKeyStr || l.target === deviceKeyStr) {
      ids.add(l.source);
      ids.add(l.target);
    }
  }
  const expandedDevices = graph.devices.filter((d) => ids.has(d.id));
  const links = graph.links.filter((l) => ids.has(l.source) && ids.has(l.target));
  return {
    ...graph,
    devices: expandedDevices,
    links,
    nodes: expandedDevices,
    edges: links,
    stats: {
      nodeCount: expandedDevices.length,
      edgeCount: links.length,
      deviceCount: expandedDevices.filter((d) => d.type !== "bgp").length,
      linkCount: links.length,
    },
  };
}

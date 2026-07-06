import {
  db,
  devicesTable,
  l2CircuitsTable,
  topologyEdgesTable,
  topologyNodesTable,
  topologySnapshotsTable,
} from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { listNetopsBgpPeers, listNetopsInterfaces } from "../netops/service.js";
import type { Device } from "@workspace/db";

export interface Node {
  nodeType: string;
  refId?: number;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface Edge {
  sourceNodeId: number;
  targetNodeId: number;
  edgeType: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export async function upsertNode(node: Node): Promise<number> {
  const refCondition =
    node.refId == null
      ? isNull(topologyNodesTable.refId)
      : eq(topologyNodesTable.refId, node.refId);

  const existing = await db
    .select({ id: topologyNodesTable.id })
    .from(topologyNodesTable)
    .where(
      and(
        eq(topologyNodesTable.nodeType, node.nodeType as typeof topologyNodesTable.$inferInsert.nodeType),
        refCondition,
        eq(topologyNodesTable.label, node.label),
      ),
    );

  if (existing.length > 0) {
    return existing[0].id;
  }

  const [inserted] = await db
    .insert(topologyNodesTable)
    .values({
      nodeType: node.nodeType as typeof topologyNodesTable.$inferInsert.nodeType,
      refId: node.refId,
      label: node.label,
      metadataJson: node.metadata ?? {},
    })
    .returning({ id: topologyNodesTable.id });

  return inserted.id;
}

export async function upsertEdge(edge: Edge): Promise<number> {
  const existing = await db
    .select({ id: topologyEdgesTable.id })
    .from(topologyEdgesTable)
    .where(
      and(
        eq(topologyEdgesTable.sourceNodeId, edge.sourceNodeId),
        eq(topologyEdgesTable.targetNodeId, edge.targetNodeId),
        eq(topologyEdgesTable.edgeType, edge.edgeType as typeof topologyEdgesTable.$inferInsert.edgeType),
      ),
    );

  if (existing.length > 0) {
    return existing[0].id;
  }

  const [inserted] = await db
    .insert(topologyEdgesTable)
    .values({
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      edgeType: edge.edgeType as typeof topologyEdgesTable.$inferInsert.edgeType,
      confidence: edge.confidence ?? 100,
      metadataJson: edge.metadata ?? {},
    })
    .returning({ id: topologyEdgesTable.id });

  return inserted.id;
}

function deviceNodeLabel(device: Device): string {
  return device.hostname;
}

export async function buildDeviceTopology(deviceId: number): Promise<void> {
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) return;

  const deviceNodeId = await upsertNode({
    nodeType: "DEVICE",
    refId: device.id,
    label: deviceNodeLabel(device),
    metadata: {
      vendor: device.vendor,
      platform: device.platform,
      site: device.site,
      role: device.role,
      status: device.status,
      ipAddress: device.ipAddress,
      hostname: device.hostname,
    },
  });

  const interfaces = (await listNetopsInterfaces(deviceId)) ?? [];
  for (const iface of interfaces) {
    const ifaceNodeId = await upsertNode({
      nodeType: "INTERFACE",
      refId: device.id,
      label: `${device.hostname}:${iface.name}`,
      metadata: {
        deviceId: device.id,
        name: iface.name,
        adminStatus: iface.adminStatus,
        operStatus: iface.operStatus,
        description: iface.description,
      },
    });
    await upsertEdge({
      sourceNodeId: deviceNodeId,
      targetNodeId: ifaceNodeId,
      edgeType: "HAS_INTERFACE",
      confidence: 100,
    });
  }

  const peers = (await listNetopsBgpPeers(deviceId)) ?? [];
  for (const peer of peers) {
    const peerLabel = `${peer.peerIp}${peer.remoteAs ? ` (AS${peer.remoteAs})` : ""}`;
    const peerNodeId = await upsertNode({
      nodeType: "BGP_PEER",
      refId: device.id,
      label: peerLabel,
      metadata: {
        deviceId: device.id,
        peerIp: peer.peerIp,
        remoteAs: peer.remoteAs,
        state: peer.state,
        role: peer.role,
        vrf: peer.vrf,
      },
    });
    await upsertEdge({
      sourceNodeId: deviceNodeId,
      targetNodeId: peerNodeId,
      edgeType: "HAS_BGP_PEER",
      confidence: 100,
      metadata: { peerIp: peer.peerIp },
    });
  }

  const circuits = await db
    .select()
    .from(l2CircuitsTable)
    .where(eq(l2CircuitsTable.deviceId, deviceId));

  for (const circuit of circuits) {
    const circuitNodeId = await upsertNode({
      nodeType: "L2_CIRCUIT",
      refId: circuit.id,
      label: circuit.name,
      metadata: {
        deviceId: device.id,
        vcId: circuit.vcId,
        peerIp: circuit.peerIp,
        circuitType: circuit.circuitType,
        localInterface: circuit.localInterface,
        operStatus: circuit.operStatus,
      },
    });
    await upsertEdge({
      sourceNodeId: deviceNodeId,
      targetNodeId: circuitNodeId,
      edgeType: "HAS_L2_CIRCUIT",
      confidence: 100,
    });
  }
}

async function linkL2Circuits(): Promise<void> {
  const circuits = await db.select().from(l2CircuitsTable);
  const nodes = await db.select().from(topologyNodesTable);
  const byRef = new Map(
    nodes.filter((n) => n.nodeType === "L2_CIRCUIT" && n.refId != null).map((n) => [n.refId!, n]),
  );

  const byVcId = new Map<string, typeof circuits>();
  for (const c of circuits) {
    if (!c.vcId) continue;
    const list = byVcId.get(c.vcId) ?? [];
    list.push(c);
    byVcId.set(c.vcId, list);
  }

  const devices = await db.select().from(devicesTable);
  const deviceByIp = new Map(devices.map((d) => [d.ipAddress, d]));

  for (const [, group] of byVcId) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const nodeA = byRef.get(a.id);
        const nodeB = byRef.get(b.id);
        if (!nodeA || !nodeB) continue;

        let confidence = 70;
        if (a.peerIp && deviceByIp.has(a.peerIp)) confidence = 90;
        if (b.peerIp && deviceByIp.has(b.peerIp)) confidence = Math.max(confidence, 90);

        await upsertEdge({
          sourceNodeId: nodeA.id,
          targetNodeId: nodeB.id,
          edgeType: "CONNECTED_TO",
          confidence,
          metadata: { vcId: a.vcId, peerIpA: a.peerIp, peerIpB: b.peerIp },
        });
      }
    }
  }
}

export async function buildSiteTopology(site: string): Promise<void> {
  const devices = await db.select().from(devicesTable).where(eq(devicesTable.site, site));
  for (const device of devices) {
    await buildDeviceTopology(device.id);
  }
  await linkL2Circuits();
}

export async function buildTopology(): Promise<void> {
  const devices = await db.select().from(devicesTable);
  for (const device of devices) {
    await buildDeviceTopology(device.id);
  }
  await linkL2Circuits();

  const nodes = await db.select().from(topologyNodesTable);
  const edges = await db.select().from(topologyEdgesTable);

  await db.insert(topologySnapshotsTable).values({
    scopeType: "global",
    scopeId: null,
    nodesCount: nodes.length,
    edgesCount: edges.length,
  });
}

export async function getTopologySummary(): Promise<{
  totalNodes: number;
  totalEdges: number;
  deviceCount: number;
  interfaceCount: number;
  bgpPeerCount: number;
  l2CircuitCount: number;
}> {
  const nodes = await db.select().from(topologyNodesTable);
  const edges = await db.select().from(topologyEdgesTable);

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    deviceCount: nodes.filter((n) => n.nodeType === "DEVICE").length,
    interfaceCount: nodes.filter((n) => n.nodeType === "INTERFACE").length,
    bgpPeerCount: nodes.filter((n) => n.nodeType === "BGP_PEER").length,
    l2CircuitCount: nodes.filter((n) => n.nodeType === "L2_CIRCUIT").length,
  };
}

export async function getDeviceTopology(deviceId: number): Promise<{
  device: (typeof topologyNodesTable.$inferSelect);
  neighbors: number;
  edges: (typeof topologyEdgesTable.$inferSelect)[];
} | null> {
  const [deviceNode] = await db
    .select()
    .from(topologyNodesTable)
    .where(and(eq(topologyNodesTable.nodeType, "DEVICE"), eq(topologyNodesTable.refId, deviceId)));

  if (!deviceNode) return null;

  const edges = await db
    .select()
    .from(topologyEdgesTable)
    .where(eq(topologyEdgesTable.sourceNodeId, deviceNode.id));

  return { device: deviceNode, neighbors: edges.length, edges };
}

export async function clearTopology(): Promise<void> {
  await db.delete(topologyEdgesTable);
  await db.delete(topologyNodesTable);
  await db.delete(topologySnapshotsTable);
}

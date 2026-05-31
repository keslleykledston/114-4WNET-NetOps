import { db } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const topologyNodesTable = (null as any);
const topologyEdgesTable = (null as any);
const topologySnapshotsTable = (null as any);

export interface Node {
  nodeType: string;
  refId?: number;
  label: string;
  metadata?: Record<string, any>;
}

export interface Edge {
  sourceNodeId: number;
  targetNodeId: number;
  edgeType: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

export async function upsertNode(node: Node): Promise<number> {
  try {
    const existing = await db
      .select({ id: topologyNodesTable.id })
      .from(topologyNodesTable)
      .where(
        and(
          eq(topologyNodesTable.nodeType, node.nodeType),
          eq(topologyNodesTable.refId, node.refId || null),
          eq(topologyNodesTable.label, node.label)
        )
      );

    if (existing.length > 0) {
      return existing[0].id;
    }

    const nodes = (await db
      .insert(topologyNodesTable)
      .values({
        nodeType: node.nodeType,
        refId: node.refId,
        label: node.label,
        metadataJson: node.metadata || {},
      })
      .returning()) as any[];

    return nodes[0].id;
  } catch (err) {
    console.error("Error upserting node:", err);
    throw err;
  }
}

export async function upsertEdge(edge: Edge): Promise<number> {
  try {
    const existing = await db
      .select({ id: topologyEdgesTable.id })
      .from(topologyEdgesTable)
      .where(
        and(
          eq(topologyEdgesTable.sourceNodeId, edge.sourceNodeId),
          eq(topologyEdgesTable.targetNodeId, edge.targetNodeId),
          eq(topologyEdgesTable.edgeType, edge.edgeType)
        )
      );

    if (existing.length > 0) {
      return existing[0].id;
    }

    const edges = (await db
      .insert(topologyEdgesTable)
      .values({
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        edgeType: edge.edgeType,
        confidence: edge.confidence || 100,
        metadataJson: edge.metadata || {},
      })
      .returning()) as any[];

    return edges[0].id;
  } catch (err) {
    console.error("Error upserting edge:", err);
    throw err;
  }
}

export async function buildDeviceTopology(deviceId: number): Promise<void> {
  console.log(`Building topology for device ${deviceId}`);

  // Create device node
  const deviceNode = await upsertNode({
    nodeType: "DEVICE",
    refId: deviceId,
    label: `Device-${deviceId}`,
  });

  // Add interface nodes (placeholder)
  const interfaceNode = await upsertNode({
    nodeType: "INTERFACE",
    refId: deviceId,
    label: `Interface-${deviceId}`,
  });

  // Create HAS_INTERFACE edge
  await upsertEdge({
    sourceNodeId: deviceNode,
    targetNodeId: interfaceNode,
    edgeType: "HAS_INTERFACE",
    confidence: 100,
  });

  // Add BGP peer nodes (placeholder)
  const bgpNode = await upsertNode({
    nodeType: "BGP_PEER",
    refId: deviceId,
    label: `BGP-Peer-${deviceId}`,
  });

  // Create HAS_BGP_PEER edge
  await upsertEdge({
    sourceNodeId: deviceNode,
    targetNodeId: bgpNode,
    edgeType: "HAS_BGP_PEER",
    confidence: 100,
  });
}

export async function buildSiteTopology(site: string): Promise<void> {
  console.log(`Building topology for site ${site}`);

  // Placeholder: fetch devices in site, build topology for each
  const devices = [] as any[];
  for (const device of devices) {
    await buildDeviceTopology(device.id);
  }
}

export async function buildTopology(): Promise<void> {
  console.log("Building full network topology");

  // Placeholder: fetch all devices
  const devices = [] as any[];
  for (const device of devices) {
    await buildDeviceTopology(device.id);
  }

  // Create snapshot
  const nodeCount = await db.select().from(topologyNodesTable);
  const edgeCount = await db.select().from(topologyEdgesTable);

  const snapshots = (await db
    .insert(topologySnapshotsTable)
    .values({
      scopeType: "global",
      scopeId: null,
      nodesCount: (nodeCount as any[]).length,
      edgesCount: (edgeCount as any[]).length,
    })
    .returning()) as any[];

  console.log(`Topology built: ${snapshots[0]?.nodesCount || 0} nodes, ${snapshots[0]?.edgesCount || 0} edges`);
}

export async function getTopologySummary(): Promise<{
  totalNodes: number;
  totalEdges: number;
  deviceCount: number;
  interfaceCount: number;
  bgpPeerCount: number;
  l2CircuitCount: number;
}> {
  try {
    const nodes = (await db.select().from(topologyNodesTable)) as any[];
    const edges = (await db.select().from(topologyEdgesTable)) as any[];

    const deviceCount = nodes.filter((n) => n.nodeType === "DEVICE").length;
    const interfaceCount = nodes.filter((n) => n.nodeType === "INTERFACE").length;
    const bgpPeerCount = nodes.filter((n) => n.nodeType === "BGP_PEER").length;
    const l2CircuitCount = nodes.filter((n) => n.nodeType === "L2_CIRCUIT").length;

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      deviceCount,
      interfaceCount,
      bgpPeerCount,
      l2CircuitCount,
    };
  } catch (err) {
    console.error("Error getting topology summary:", err);
    return {
      totalNodes: 0,
      totalEdges: 0,
      deviceCount: 0,
      interfaceCount: 0,
      bgpPeerCount: 0,
      l2CircuitCount: 0,
    };
  }
}

export async function getDeviceTopology(deviceId: number): Promise<any> {
  try {
    const deviceNode = (await db
      .select()
      .from(topologyNodesTable)
      .where(
        and(
          eq(topologyNodesTable.nodeType, "DEVICE"),
          eq(topologyNodesTable.refId, deviceId)
        )
      )) as any[];

    if (!deviceNode.length) {
      return null;
    }

    const node = deviceNode[0];
    const edges = (await db
      .select()
      .from(topologyEdgesTable)
      .where(eq(topologyEdgesTable.sourceNodeId, node.id))) as any[];

    return {
      device: node,
      neighbors: edges.length,
      edges,
    };
  } catch (err) {
    console.error("Error getting device topology:", err);
    return null;
  }
}

export async function clearTopology(): Promise<void> {
  try {
    await db.delete(topologyEdgesTable);
    await db.delete(topologyNodesTable);
    await db.delete(topologySnapshotsTable);
    console.log("Topology cleared");
  } catch (err) {
    console.error("Error clearing topology:", err);
  }
}

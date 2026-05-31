import { db } from "@workspace/db";
import { eq, isNull, and } from "drizzle-orm";

const topologyNodesTable = (null as any);
const topologyEdgesTable = (null as any);

export interface OrphanNode {
  id: number;
  nodeType: string;
  label: string;
  refId?: number;
  reason: string;
}

export async function detectOrphans(): Promise<OrphanNode[]> {
  const orphans: OrphanNode[] = [];

  try {
    const nodes = (await db.select().from(topologyNodesTable)) as any[];

    for (const node of nodes) {
      // L2 Circuit orphans: no CONNECTED_TO edge
      if (node.nodeType === "L2_CIRCUIT") {
        const edges = (await db
          .select()
          .from(topologyEdgesTable)
          .where(
            and(
              eq(topologyEdgesTable.sourceNodeId, node.id),
              eq(topologyEdgesTable.edgeType, "CONNECTED_TO")
            )
          )) as any[];

        if (edges.length === 0) {
          orphans.push({
            id: node.id,
            nodeType: "L2_CIRCUIT",
            label: node.label,
            refId: node.refId,
            reason: "No remote endpoint detected",
          });
        }
      }

      // BGP Peer orphans: no device connection
      if (node.nodeType === "BGP_PEER") {
        const edges = (await db
          .select()
          .from(topologyEdgesTable)
          .where(
            and(
              eq(topologyEdgesTable.targetNodeId, node.id),
              eq(topologyEdgesTable.edgeType, "HAS_BGP_PEER")
            )
          )) as any[];

        if (edges.length === 0) {
          orphans.push({
            id: node.id,
            nodeType: "BGP_PEER",
            label: node.label,
            refId: node.refId,
            reason: "No device association",
          });
        }
      }

      // Interface orphans: no HAS_INTERFACE edge from device
      if (node.nodeType === "INTERFACE") {
        const edges = (await db
          .select()
          .from(topologyEdgesTable)
          .where(
            and(
              eq(topologyEdgesTable.targetNodeId, node.id),
              eq(topologyEdgesTable.edgeType, "HAS_INTERFACE")
            )
          )) as any[];

        if (edges.length === 0) {
          orphans.push({
            id: node.id,
            nodeType: "INTERFACE",
            label: node.label,
            refId: node.refId,
            reason: "No device association",
          });
        }
      }

      // Service orphans: no device or resource
      if (node.nodeType === "SERVICE") {
        const deviceEdges = (await db
          .select()
          .from(topologyEdgesTable)
          .where(
            and(
              eq(topologyEdgesTable.sourceNodeId, node.id),
              eq(topologyEdgesTable.edgeType, "SERVICE_ON_DEVICE")
            )
          )) as any[];

        const resourceEdges = (await db
          .select()
          .from(topologyEdgesTable)
          .where(
            and(
              eq(topologyEdgesTable.sourceNodeId, node.id),
              eq(topologyEdgesTable.edgeType, "USES_RESOURCE")
            )
          )) as any[];

        if (deviceEdges.length === 0 && resourceEdges.length === 0) {
          orphans.push({
            id: node.id,
            nodeType: "SERVICE",
            label: node.label,
            refId: node.refId,
            reason: "No device or resource association",
          });
        }
      }
    }
  } catch (err) {
    console.error("Error detecting orphans:", err);
  }

  return orphans;
}

export async function getOrphansSummary(): Promise<{
  totalOrphans: number;
  byType: Record<string, number>;
}> {
  const orphans = await detectOrphans();

  const byType: Record<string, number> = {};
  for (const orphan of orphans) {
    byType[orphan.nodeType] = (byType[orphan.nodeType] || 0) + 1;
  }

  return {
    totalOrphans: orphans.length,
    byType,
  };
}

import { db, topologyEdgesTable, topologyNodesTable } from "@workspace/db";

export async function getTopologyGraph(params: {
  scope: "global" | "site" | "device";
  scopeId?: string;
}): Promise<{ nodes: unknown[]; edges: unknown[] }> {
  const nodes = await db.select().from(topologyNodesTable);
  const edges = await db.select().from(topologyEdgesTable);

  if (params.scope === "device" && params.scopeId) {
    const deviceId = Number(params.scopeId);
    if (!Number.isFinite(deviceId)) return { nodes: [], edges: [] };
    const deviceNodes = nodes.filter((n) => n.nodeType === "DEVICE" && n.refId === deviceId);
    const deviceNodeIds = new Set(deviceNodes.map((n) => n.id));
    const scopedEdges = edges.filter(
      (e) => deviceNodeIds.has(e.sourceNodeId) || deviceNodeIds.has(e.targetNodeId),
    );
    const relatedNodeIds = new Set<number>();
    for (const edge of scopedEdges) {
      relatedNodeIds.add(edge.sourceNodeId);
      relatedNodeIds.add(edge.targetNodeId);
    }
    return {
      nodes: nodes.filter((n) => relatedNodeIds.has(n.id)),
      edges: scopedEdges,
    };
  }

  if (params.scope === "site" && params.scopeId) {
    const site = params.scopeId;
    const deviceNodes = nodes.filter(
      (n) =>
        n.nodeType === "DEVICE" &&
        typeof (n.metadataJson as Record<string, unknown> | null)?.site === "string" &&
        (n.metadataJson as Record<string, string>).site === site,
    );
    const deviceNodeIds = new Set(deviceNodes.map((n) => n.id));
    const scopedEdges = edges.filter(
      (e) => deviceNodeIds.has(e.sourceNodeId) || deviceNodeIds.has(e.targetNodeId),
    );
    const relatedNodeIds = new Set<number>();
    for (const edge of scopedEdges) {
      relatedNodeIds.add(edge.sourceNodeId);
      relatedNodeIds.add(edge.targetNodeId);
    }
    return {
      nodes: nodes.filter((n) => relatedNodeIds.has(n.id)),
      edges: scopedEdges,
    };
  }

  return { nodes, edges };
}

export async function computeDeviceInterfacesUtilization(
  _deviceId: number,
): Promise<Record<string, number>> {
  return {};
}

export async function computeLinkUtilization(
  links: Array<{
    linkId: string;
    sourceDeviceId: number;
    intfA: string;
    targetDeviceId: number;
    intfB: string;
  }>,
): Promise<
  Array<{
    linkId: string;
    utilizationPct: number | null;
    sourceUtilPct: number | null;
    targetUtilPct: number | null;
  }>
> {
  return links.map((link) => ({
    linkId: link.linkId,
    utilizationPct: null,
    sourceUtilPct: null,
    targetUtilPct: null,
  }));
}

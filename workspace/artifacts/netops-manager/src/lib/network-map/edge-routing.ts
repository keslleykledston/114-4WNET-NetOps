import { getSmoothStepPath, type Position } from "reactflow";
import type { LinkData, LinkWaypoint } from "./types";

export interface FlowPoint {
  x: number;
  y: number;
}

/** Index-based offset for parallel edges sharing the same node pair. */
export function edgePairOffset(
  linkId: string,
  links: Array<{ id: string; source: string; target: string }>,
): number {
  const self = links.find((l) => l.id === linkId);
  if (!self) return 0;
  const key = [self.source, self.target].sort().join("::");
  const siblings = links.filter(
    (l) => [l.source, l.target].sort().join("::") === key,
  );
  const idx = siblings.findIndex((l) => l.id === linkId);
  const n = siblings.length;
  if (n <= 1) return 0;
  const step = 14;
  return (idx - (n - 1) / 2) * step;
}

function joinPaths(a: string, b: string): string {
  const tail = b.replace(/^M\s*[\d.-]+\s*[\d.-]+/, "L");
  return `${a} ${tail}`;
}

function segmentPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  sourcePosition: Position,
  targetPosition: Position,
  offset: number,
): string {
  const [path] = getSmoothStepPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
    sourcePosition,
    targetPosition,
    borderRadius: 10,
    offset,
  });
  return path;
}

/**
 * Build an SVG path for topology edges, optionally routed through waypoints.
 * Returns [path, labelX, labelY].
 */
export function getOrthogonalPathPoints(
  source: FlowPoint,
  target: FlowPoint,
  waypoints: FlowPoint[],
  sourcePosition: Position,
  targetPosition: Position,
  offset: number = 0,
): FlowPoint[] {
  if (waypoints.length === 0) {
    return [source, target];
  }

  const points: FlowPoint[] = [source];
  const allWaypoints = [...waypoints, target];
  let current = source;
  let isHorizontal = sourcePosition === "left" || sourcePosition === "right";

  for (let i = 0; i < allWaypoints.length; i++) {
    const next = allWaypoints[i];
    if (current.x === next.x) {
      points.push(next);
      isHorizontal = true;
    } else if (current.y === next.y) {
      points.push(next);
      isHorizontal = false;
    } else if (isHorizontal) {
      points.push({ x: next.x, y: current.y });
      points.push(next);
      isHorizontal = false;
    } else {
      points.push({ x: current.x, y: next.y });
      points.push(next);
      isHorizontal = true;
    }
    current = next;
  }

  if (offset !== 0 && points.length > 2) {
    return points.map((p, idx) => {
      if (idx === 0 || idx === points.length - 1) return p;
      const prev = points[idx - 1];
      const next = points[idx + 1];
      const prevIsHorizontal = prev.y === p.y;
      const nextIsHorizontal = next && next.y === p.y;
      if (prevIsHorizontal && !nextIsHorizontal) return { x: p.x, y: p.y + offset };
      if (!prevIsHorizontal && nextIsHorizontal) return { x: p.x + offset, y: p.y };
      return p;
    });
  }

  return points;
}

export function getTopologyEdgePath(params: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  waypoints?: FlowPoint[];
  offset?: number;
}): [string, number, number] {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    waypoints = [],
    offset = 0,
  } = params;

  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };

  if (waypoints.length === 0) {
    const [path] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 16,
      offset,
    });
    return [path, (sourceX + targetX) / 2, (sourceY + targetY) / 2];
  }

  const pathPoints = getOrthogonalPathPoints(source, target, waypoints, sourcePosition, targetPosition, offset);

  let path = `M ${pathPoints[0].x} ${pathPoints[0].y}`;
  for (let i = 1; i < pathPoints.length; i++) {
    path += ` L ${pathPoints[i].x} ${pathPoints[i].y}`;
  }

  let labelX = (sourceX + targetX) / 2;
  let labelY = (sourceY + targetY) / 2;
  if (pathPoints.length > 2) {
    const midIdx = Math.floor(pathPoints.length / 2);
    const midPoint = pathPoints[midIdx];
    if (midPoint) {
      labelX = midPoint.x;
      labelY = midPoint.y;
    }
  }

  return [path, labelX, labelY];
}

export function getInitialWaypoints(
  source: FlowPoint,
  target: FlowPoint,
  sourcePosition: Position,
  targetPosition: Position,
): FlowPoint[] {
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;

  if (sourcePosition === "left" || sourcePosition === "right") {
    return [
      { x: midX, y: source.y },
      { x: midX, y: target.y },
    ];
  }

  return [
    { x: source.x, y: midY },
    { x: target.x, y: midY },
  ];
}

export type EdgePathAnchorRole = "source-side" | "target-side";

export interface EdgePathAnchor {
  point: FlowPoint;
  role: EdgePathAnchorRole;
  index: number;
}

function handleAnchorPoint(
  nodePos: FlowPoint,
  handleId: string | undefined,
): FlowPoint {
  const side = handleId?.split("-")[0] ?? "right";
  const slot = handleId?.split("-")[1] ?? "1";
  const offsetPct =
    side === "top" ? (slot === "0" ? 20 : slot === "2" ? 80 : 50)
    : side === "right" ? (slot === "0" ? 25 : slot === "2" ? 75 : 50)
    : side === "bottom" ? (slot === "0" ? 20 : slot === "2" ? 80 : 50)
    : (slot === "0" ? 25 : slot === "2" ? 75 : 50);

  const W = 220;
  const H = 90;
  if (side === "top") return { x: nodePos.x + W * (offsetPct / 100), y: nodePos.y };
  if (side === "bottom") return { x: nodePos.x + W * (offsetPct / 100), y: nodePos.y + H };
  if (side === "left") return { x: nodePos.x, y: nodePos.y + H * (offsetPct / 100) };
  return { x: nodePos.x + W, y: nodePos.y + H * (offsetPct / 100) };
}

function looksAbsoluteWaypoint(wp: LinkWaypoint, source: FlowPoint, target: FlowPoint): boolean {
  const canvasMagnitude = Math.max(
    Math.abs(wp.x - source.x),
    Math.abs(wp.y - source.y),
    Math.abs(wp.x - target.x),
    Math.abs(wp.y - target.y),
  );
  return canvasMagnitude > 120;
}

/**
 * Normalize edge waypoints to canonical canvas coordinates.
 *
 * Legacy layouts from the broken integration may store 2 bend points as deltas
 * from source/target handles. Canonical data stores absolute canvas points.
 * This helper converts legacy payloads once, then should become unnecessary
 * after all saved layouts are migrated.
 */
export function normalizeEdgeWaypoints(
  edge: LinkData,
  nodesById: Record<string, FlowPoint | undefined>,
): LinkData {
  if (!edge.waypoints || edge.waypoints.length === 0) return edge;

  const source = nodesById[edge.source];
  const target = nodesById[edge.target];
  if (!source || !target) return edge;

  const sourceAnchor = handleAnchorPoint(source, edge.sourceHandle);
  const targetAnchor = handleAnchorPoint(target, edge.targetHandle);

  const waypoints = edge.waypoints;
  const alreadyAbsolute = waypoints.some((wp) => looksAbsoluteWaypoint(wp, source, target));
  if (alreadyAbsolute) return edge;

  if (waypoints.length === 2) {
    return {
      ...edge,
      waypoints: [
        { x: sourceAnchor.x + waypoints[0].x, y: sourceAnchor.y + waypoints[0].y },
        { x: targetAnchor.x + waypoints[1].x, y: targetAnchor.y + waypoints[1].y },
      ],
    };
  }

  return edge;
}

/** Anchors near each end of the link path (not on the capacity label). */
export function defaultEdgeAnchors(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
  offset: number,
  fractions: Array<{ t: number; role: EdgePathAnchorRole }> = [
    { t: 0.2, role: "source-side" },
    { t: 0.8, role: "target-side" },
  ],
): EdgePathAnchor[] {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
    offset,
  });

  if (typeof document === "undefined") {
    return fractions.map((entry, index) => ({
      index,
      role: entry.role,
      point: {
        x: sourceX + (targetX - sourceX) * entry.t,
        y: sourceY + (targetY - sourceY) * entry.t,
      },
    }));
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pathEl.setAttribute("d", path);
  svg.appendChild(pathEl);
  const total = pathEl.getTotalLength();

  return fractions.map((entry, index) => {
    const pt = pathEl.getPointAtLength(total * entry.t);
    return {
      index,
      role: entry.role,
      point: { x: pt.x, y: pt.y },
    };
  });
}

/** Default bend point when the user has not placed a waypoint yet. */
export function defaultWaypoint(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): FlowPoint {
  return {
    x: (sourceX + targetX) / 2,
    y: (sourceY + targetY) / 2,
  };
}

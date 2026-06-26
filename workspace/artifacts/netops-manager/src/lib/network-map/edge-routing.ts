import { getSmoothStepPath, type Position } from "reactflow";

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
    waypoints,
    offset = 0,
  } = params;

  if (!waypoints?.length) {
    const [path, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 12,
      offset,
    });
    return [path, labelX, labelY];
  }

  const points = waypoints;
  let path = segmentPath(
    sourceX,
    sourceY,
    points[0].x,
    points[0].y,
    sourcePosition,
    targetPosition,
    offset,
  );

  for (let i = 0; i < points.length - 1; i += 1) {
    const next = segmentPath(
      points[i].x,
      points[i].y,
      points[i + 1].x,
      points[i + 1].y,
      targetPosition,
      targetPosition,
      offset,
    );
    path = joinPaths(path, next);
  }

  const last = points[points.length - 1];
  const tail = segmentPath(
    last.x,
    last.y,
    targetX,
    targetY,
    targetPosition,
    targetPosition,
    offset,
  );
  path = joinPaths(path, tail);

  const midIdx = Math.floor((points.length - 1) / 2);
  const labelPoint = points[midIdx] ?? last;
  return [path, labelPoint.x, labelPoint.y];
}

export type EdgePathAnchorRole = "source-side" | "target-side";

export interface EdgePathAnchor {
  point: FlowPoint;
  role: EdgePathAnchorRole;
  index: number;
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

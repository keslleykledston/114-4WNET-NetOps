import { useCallback, useMemo, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  type EdgeProps,
} from "reactflow";
import type { LinkData, LinkWaypoint } from "@/lib/network-map/types";
import {
  defaultEdgeAnchors,
  getTopologyEdgePath,
  type EdgePathAnchorRole,
} from "@/lib/network-map/edge-routing";
import { edgeLabel, edgeStyle } from "./edge-styles";

interface ExtendedLinkData extends LinkData {
  _dimmed?: boolean;
  _highlighted?: boolean;
  _editMode?: boolean;
  _edgeOffset?: number;
  _onWaypointChange?: (edgeId: string, waypoints: LinkWaypoint[]) => void;
}

const ANCHOR_STYLES: Record<EdgePathAnchorRole, string> = {
  "source-side":
    "group-hover/anchor:border-emerald-400/60 group-hover/anchor:bg-emerald-500/20 group-active/anchor:border-emerald-300",
  "target-side":
    "group-hover/anchor:border-violet-400/60 group-hover/anchor:bg-violet-500/20 group-active/anchor:border-violet-300",
};

export function TopologyEdge(props: EdgeProps<ExtendedLinkData>) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
    markerEnd,
  } = props;
  const { screenToFlowPosition } = useReactFlow();
  const dragRef = useRef<{ anchorIndex: number } | null>(null);
  const [dragPoint, setDragPoint] = useState<LinkWaypoint | null>(null);
  const [draggingAnchorIndex, setDraggingAnchorIndex] = useState<number | null>(null);
  const onWaypointChange = data?._onWaypointChange;

  const commitWaypoint = useCallback(
    (anchorIndex: number, point: LinkWaypoint, defaultPoints: LinkWaypoint[]) => {
      const stored = data?.waypoints ?? [];
      const base =
        stored.length >= defaultPoints.length
          ? [...stored]
          : defaultPoints.map((p, i) => stored[i] ?? p);
      base[anchorIndex] = point;
      onWaypointChange?.(id, base);
    },
    [data?.waypoints, id, onWaypointChange],
  );

  const finishDrag = useCallback(
    (anchorIndex: number, clientX: number, clientY: number, defaultPoints: LinkWaypoint[]) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDraggingAnchorIndex(null);
      const flow = screenToFlowPosition({ x: clientX, y: clientY });
      setDragPoint(null);
      commitWaypoint(anchorIndex, flow, defaultPoints);
    },
    [commitWaypoint, screenToFlowPosition],
  );

  if (!data) return null;

  const offset = data._edgeOffset ?? 0;
  const storedWaypoints = data.waypoints ?? [];
  const editMode = data._editMode ?? false;

  const defaultAnchors = useMemo(
    () =>
      defaultEdgeAnchors(
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        offset,
      ),
    [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, offset],
  );

  const defaultPoints = useMemo(
    () => defaultAnchors.map((a) => a.point),
    [defaultAnchors],
  );

  const anchorPoints = useMemo(() => {
    if (storedWaypoints.length >= defaultAnchors.length) {
      return storedWaypoints.map((wp, i) => ({
        index: i,
        role: defaultAnchors[i]?.role ?? ("source-side" as EdgePathAnchorRole),
        point: draggingAnchorIndex === i && dragPoint ? dragPoint : wp,
      }));
    }
    return defaultAnchors.map((anchor) => ({
      index: anchor.index,
      role: anchor.role,
      point:
        draggingAnchorIndex === anchor.index && dragPoint
          ? dragPoint
          : storedWaypoints[anchor.index] ?? anchor.point,
    }));
  }, [storedWaypoints, defaultAnchors, dragPoint, draggingAnchorIndex]);

  const activeWaypoints = anchorPoints.map((a) => a.point);
  const hasCustomRoute = storedWaypoints.length > 0 || Boolean(dragPoint);

  const [edgePath, labelX, labelY] = hasCustomRoute
    ? getTopologyEdgePath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        waypoints: activeWaypoints,
        offset,
      })
    : getTopologyEdgePath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        offset,
      });

  const baseStyle = edgeStyle(data.edgeType, data.status, data.utilizationPct);
  const dim = data._dimmed;
  const hi = data._highlighted || selected;

  const style: React.CSSProperties = {
    ...baseStyle,
    opacity: dim ? 0.18 : 1,
    strokeWidth: hi ? Number(baseStyle.strokeWidth ?? 2) + 1.5 : baseStyle.strokeWidth,
    filter: hi ? `drop-shadow(0 0 6px ${baseStyle.stroke ?? "#fff"})` : undefined,
  };

  const tooltip = `${data.edgeType.toUpperCase()} • ${data.capacity}\n${data.intfA} ↔ ${data.intfB}\nStatus: ${data.status} • Origem: ${data.origin}${data.utilizationPct != null ? `\nUso: ${data.utilizationPct}%` : ""}`;

  const startDrag = (anchorIndex: number, e: React.PointerEvent) => {
    if (!editMode) return;
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { anchorIndex };
    setDraggingAnchorIndex(anchorIndex);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = anchorPoints[anchorIndex]?.point;
    if (pt) setDragPoint(pt);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    setDragPoint(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  const onPointerUp = (anchorIndex: number, e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    finishDrag(anchorIndex, e.clientX, e.clientY, defaultPoints);
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
    setDraggingAnchorIndex(null);
    setDragPoint(null);
  };

  return (
    <>
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18} className="nopan" />
      <BaseEdge path={edgePath} style={style} markerEnd={markerEnd} interactionWidth={0} />
      <EdgeLabelRenderer>
        <div
          title={tooltip}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "none",
            opacity: dim ? 0.3 : 1,
            zIndex: 5,
          }}
          className={`select-none rounded border px-1.5 py-0.5 text-[9px] font-medium leading-none backdrop-blur-sm ${
            hi
              ? "border-sky-500/60 bg-zinc-900/95 text-sky-200"
              : "border-zinc-700/80 bg-zinc-900/85 text-zinc-300"
          }`}
        >
          {edgeLabel(data.edgeType, data.capacity, data.utilizationPct)}
        </div>
        {editMode &&
          anchorPoints.map(({ index, role, point }) => (
            <div
              key={`anchor-${role}-${index}`}
              role="presentation"
              onPointerDown={(e) => startDrag(index, e)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(index, e)}
              onPointerCancel={onPointerCancel}
              title={
                role === "source-side"
                  ? "Âncora origem — arraste para curvar o link perto do device de origem"
                  : "Âncora destino — arraste para curvar o link perto do device de destino"
              }
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
                pointerEvents: "all",
                zIndex: selected || hi ? 30 : 20,
              }}
              className="nodrag nopan nowheel group/anchor h-6 w-6 cursor-grab active:cursor-grabbing"
            >
              <span
                className={`absolute inset-0 rounded-sm border-2 border-zinc-600/40 bg-zinc-800/30 transition-colors ${ANCHOR_STYLES[role]}`}
              />
            </div>
          ))}
      </EdgeLabelRenderer>
    </>
  );
}

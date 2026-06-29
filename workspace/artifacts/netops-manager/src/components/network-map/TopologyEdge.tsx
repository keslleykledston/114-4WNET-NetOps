import { useMemo, useRef } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  type EdgeProps,
} from "reactflow";
import type { LinkData, LinkWaypoint } from "@/lib/network-map/types";
import {
  getTopologyEdgePath,
  getOrthogonalPathPoints,
  getInitialWaypoints,
  type FlowPoint,
} from "@/lib/network-map/edge-routing";
import { edgeLabel, edgeStyle } from "./edge-styles";
import { toast } from "sonner";
import { useTranslation } from "@/i18n";

interface ExtendedLinkData extends LinkData {
  _dimmed?: boolean;
  _highlighted?: boolean;
  _editMode?: boolean;
  _edgeOffset?: number;
  _onWaypointChange?: (edgeId: string, waypoints: LinkWaypoint[]) => void;
}

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
  const { t } = useTranslation();
  const { screenToFlowPosition } = useReactFlow();

  const onWaypointChange = data?._onWaypointChange;

  if (!data) return null;

  const offset = data._edgeOffset ?? 0;
  const storedWaypoints = data.waypoints ?? [];
  const editMode = data._editMode ?? false;

  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };

  // Keep values updated in a ref to avoid stale closures in event listeners
  const stateRef = useRef({ storedWaypoints, sourceX, sourceY, targetX, targetY, onWaypointChange, id });
  stateRef.current = { storedWaypoints, sourceX, sourceY, targetX, targetY, onWaypointChange, id };

  const absoluteWaypoints = useMemo(() => {
    return storedWaypoints;
  }, [storedWaypoints]);

  // Strict orthogonal path calculation using absolute coordinates
  const pathPoints = getOrthogonalPathPoints(
    source,
    target,
    absoluteWaypoints,
    sourcePosition,
    targetPosition,
    offset,
  );

  // SVG path and label position using absolute coordinates
  const [edgePath, labelX, labelY] = getTopologyEdgePath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    waypoints: absoluteWaypoints,
    offset,
  });

  // Calculate segments for middle handles using absolute path points
  const segments = pathPoints.slice(0, -1).map((p1, i) => {
    const p2 = pathPoints[i + 1];
    const isH = Math.abs(p1.x - p2.x) > Math.abs(p1.y - p2.y);
    return {
      index: i,
      p1,
      p2,
      type: isH ? ("horizontal" as const) : ("vertical" as const),
      midpoint: {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      },
    };
  });

  // Waypoint Drag Handlers
  const startWaypointDrag = (index: number, e: React.PointerEvent) => {
    if (!editMode) return;
    e.stopPropagation();
    e.preventDefault();

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const { sourceX, sourceY, targetX, targetY, onWaypointChange, id, storedWaypoints } = stateRef.current;
      const flowPos = screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
      
      const nextWps = [...storedWaypoints];
      nextWps[index] = { x: flowPos.x, y: flowPos.y };
      onWaypointChange?.(id, nextWps);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  // Segment Drag Handlers
  const startSegmentDrag = (segmentIndex: number, type: "horizontal" | "vertical", e: React.PointerEvent) => {
    if (!editMode) return;
    e.stopPropagation();
    e.preventDefault();

    const { storedWaypoints, sourceX, sourceY, targetX, targetY } = stateRef.current;
    const sourceVal = { x: sourceX, y: sourceY };
    const targetVal = { x: targetX, y: targetY };

    const currentWps = storedWaypoints.length > 0
      ? [...storedWaypoints]
      : getInitialWaypoints(sourceVal, targetVal, sourcePosition, targetPosition);

    const startX = e.clientX;
    const startY = e.clientY;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const { sourceX, sourceY, targetX, targetY, onWaypointChange, id } = stateRef.current;
      const startFlow = screenToFlowPosition({ x: startX, y: startY });
      const currentFlow = screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
      const deltaX = currentFlow.x - startFlow.x;
      const deltaY = currentFlow.y - startFlow.y;

      const nextWpsAbsolute = currentWps.map((wp, idx) => {
        const newWp = { ...wp };
        const isFirst = segmentIndex === 0;
        const isLast = segmentIndex === currentWps.length;

        if (isFirst) {
          if (idx === 0) {
            if (type === "horizontal") newWp.y += deltaY;
            else newWp.x += deltaX;
          }
        } else if (isLast) {
          if (idx === currentWps.length - 1) {
            if (type === "horizontal") newWp.y += deltaY;
            else newWp.x += deltaX;
          }
        } else {
          if (idx === segmentIndex - 1 || idx === segmentIndex) {
            if (type === "horizontal") newWp.y += deltaY;
            else newWp.x += deltaX;
          }
        }
        return newWp;
      });

      onWaypointChange?.(id, nextWpsAbsolute);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

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

  return (
    <>
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={24} className="nopan react-flow__edge-interaction" />
      <BaseEdge path={edgePath} style={style} markerEnd={markerEnd} />
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

        {/* Waypoint Handles */}
        {editMode &&
          selected &&
          absoluteWaypoints.map((wp, index) => (
            <div
              key={`wp-handle-${index}`}
              role="presentation"
              onPointerDown={(e) => startWaypointDrag(index, e)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                const nextWps = storedWaypoints.filter((_, idx) => idx !== index);
                onWaypointChange?.(id, nextWps);
                toast.success(t("networkMap.topologyEdge.waypointRemoved"));
              }}
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)`,
                pointerEvents: "all",
                zIndex: 40,
              }}
              className="nodrag nopan nowheel group/anchor h-6 w-6 cursor-grab active:cursor-grabbing"
              title={t("networkMap.topologyEdge.dragWaypointTitle")}
            >
              <span className="absolute inset-1.5 rounded-full border border-white/30 bg-sky-500 hover:bg-sky-400 active:border-sky-300 shadow-[0_0_8px_rgba(14,165,233,0.7)] transition-all" />
            </div>
          ))}

        {/* Segment Drag Handles */}
        {editMode &&
          selected &&
          segments.map((seg) => (
            <div
              key={`seg-handle-${seg.index}`}
              role="presentation"
              onPointerDown={(e) => startSegmentDrag(seg.index, seg.type, e)}
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${seg.midpoint.x}px, ${seg.midpoint.y}px)`,
                pointerEvents: "all",
                zIndex: 35,
              }}
              className={`nodrag nopan nowheel group/anchor h-5 w-5 flex items-center justify-center cursor-${
                seg.type === "horizontal" ? "ns" : "ew"
              }-resize`}
              title={t("networkMap.topologyEdge.dragSegmentTitle")}
            >
              <span className="h-3.5 w-3.5 rounded-full border border-white/20 bg-zinc-700 hover:bg-sky-500 flex items-center justify-center text-[10px] font-bold text-white transition-all shadow-[0_0_6px_rgba(0,0,0,0.6)]">
                +
              </span>
            </div>
          ))}
      </EdgeLabelRenderer>
    </>
  );
}

import { Handle, Position, type NodeProps } from "reactflow";
import {
  Router,
  Network,
  Radio,
  Shield,
  Server,
  User,
  Globe,
  Building2,
  Waypoints,
  AlertTriangle,
  Cable,
} from "lucide-react";
import type { DeviceData, NodeStatus } from "@/lib/network-map/types";

const ICONS = {
  router: Router,
  switch: Network,
  olt: Waypoints,
  dwdm: Radio,
  firewall: Shield,
  server: Server,
  customer: User,
  bgp: Globe,
  site: Building2,
};

const STATUS_RING: Record<NodeStatus, string> = {
  UP: "border-emerald-500/70",
  DOWN: "border-red-500/80",
  PARTIAL: "border-amber-500/80",
  UNKNOWN: "border-zinc-700",
  PLANNED: "border-sky-500/70 border-dashed",
};

const STATUS_DOT: Record<NodeStatus, string> = {
  UP: "bg-emerald-500 shadow-[0_0_6px_rgb(16,185,129,0.7)]",
  DOWN: "bg-red-500",
  PARTIAL: "bg-amber-500",
  UNKNOWN: "bg-zinc-500",
  PLANNED: "bg-sky-500",
};

/** Three evenly spaced connection slots per side (edit mode only). */
const SIDE_SLOTS: Array<{
  side: "top" | "right" | "bottom" | "left";
  position: Position;
  slots: Array<{ id: string; offsetPct: number }>;
}> = [
  {
    side: "top",
    position: Position.Top,
    slots: [
      { id: "top-0", offsetPct: 20 },
      { id: "top", offsetPct: 50 },
      { id: "top-2", offsetPct: 80 },
    ],
  },
  {
    side: "right",
    position: Position.Right,
    slots: [
      { id: "right-0", offsetPct: 25 },
      { id: "right", offsetPct: 50 },
      { id: "right-2", offsetPct: 75 },
    ],
  },
  {
    side: "bottom",
    position: Position.Bottom,
    slots: [
      { id: "bottom-0", offsetPct: 20 },
      { id: "bottom", offsetPct: 50 },
      { id: "bottom-2", offsetPct: 80 },
    ],
  },
  {
    side: "left",
    position: Position.Left,
    slots: [
      { id: "left-0", offsetPct: 25 },
      { id: "left", offsetPct: 50 },
      { id: "left-2", offsetPct: 75 },
    ],
  },
];

function slotStyle(
  position: Position,
  offsetPct: number,
): React.CSSProperties {
  switch (position) {
    case Position.Top:
      return { left: `${offsetPct}%`, top: 0, transform: "translate(-50%, -50%)" };
    case Position.Bottom:
      return { left: `${offsetPct}%`, bottom: 0, transform: "translate(-50%, 50%)" };
    case Position.Left:
      return { top: `${offsetPct}%`, left: 0, transform: "translate(-50%, -50%)" };
    case Position.Right:
      return { top: `${offsetPct}%`, right: 0, transform: "translate(50%, -50%)" };
    default:
      return {};
  }
}

interface ExtendedDeviceData extends DeviceData {
  _linkCount?: number;
  _dimmed?: boolean;
  _highlighted?: boolean;
  _onOpenStencil?: (d: DeviceData) => void;
  _onHandleClick?: (nodeId: string, handleId: string, type: "source" | "target") => void;
  _connectable?: boolean;
}

export function TopologyNode({ data, selected }: NodeProps<ExtendedDeviceData>) {
  const Icon = ICONS[data.type] ?? Router;
  const linkCount = data._linkCount ?? 0;
  const dimmed = data._dimmed;
  const highlighted = data._highlighted;
  const connectable = data._connectable ?? false;
  const tooltip = [
    data.name,
    data.mgmtIp ? `IP: ${data.mgmtIp}` : null,
    `Site: ${data.site}`,
    `Status: ${data.status}`,
    `Vendor: ${data.vendor}`,
    data.uptime ? `Uptime: ${data.uptime}` : null,
  ].filter(Boolean).join("\n");
  const { _onOpenStencil, _onHandleClick, _linkCount, _dimmed, _highlighted, _connectable, ...device } =
    data as ExtendedDeviceData;
  void _onHandleClick;
  void _linkCount;
  void _dimmed;
  void _highlighted;
  void _connectable;

  const handleBase =
    "!absolute !h-2.5 !w-2.5 !rounded-full !border !border-zinc-500 !bg-zinc-700 transition-opacity";
  const handleVisible = connectable
    ? "opacity-90 hover:!opacity-100 hover:!border-sky-400 hover:!bg-sky-500/40"
    : "!opacity-0 !pointer-events-none";

  return (
    <div
      title={tooltip}
      className={`group relative min-w-[210px] rounded-lg border-2 bg-zinc-900/95 px-3 py-2.5 text-zinc-100 transition-all backdrop-blur ${STATUS_RING[data.status]} ${
        selected ? "ring-2 ring-sky-400/80 shadow-[0_0_0_4px_rgba(56,189,248,0.15)]" : ""
      } ${highlighted && !selected ? "ring-2 ring-sky-400/50" : ""} ${dimmed ? "opacity-30" : "opacity-100"}`}
    >
      {SIDE_SLOTS.flatMap(({ position, slots }) =>
        slots.flatMap(({ id, offsetPct }) => [
          <Handle
            key={`${id}-target`}
            id={id}
            type="target"
            position={position}
            isConnectable={connectable}
            isConnectableStart={connectable}
            isConnectableEnd={connectable}
            className={`${handleBase} ${handleVisible}`}
            style={slotStyle(position, offsetPct)}
            onClick={(e) => {
              e.stopPropagation();
              if (data._onHandleClick) {
                data._onHandleClick(data.id, id, "target");
              }
            }}
          />,
          <Handle
            key={`${id}-source`}
            id={id}
            type="source"
            position={position}
            isConnectable={connectable}
            isConnectableStart={connectable}
            isConnectableEnd={connectable}
            className={`${handleBase} ${handleVisible}`}
            style={slotStyle(position, offsetPct)}
            onClick={(e) => {
              e.stopPropagation();
              if (data._onHandleClick) {
                data._onHandleClick(data.id, id, "source");
              }
            }}
          />,
        ]),
      )}
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          title="Abrir faceplate do dispositivo"
          onClick={(e) => {
            e.stopPropagation();
            _onOpenStencil?.(device as DeviceData);
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-200 transition-colors hover:bg-sky-500/20 hover:text-sky-300"
        >
          <Icon className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[data.status]}`} />
            <span className="truncate text-[11px] font-semibold tracking-tight">
              {data.name}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[10px] text-zinc-400">
            {data.vendor} • {data.role}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
            <span className={`rounded px-1 py-0.5 font-medium uppercase tracking-wide ${
              data.status === "UP" ? "bg-emerald-500/15 text-emerald-400" :
              data.status === "DOWN" ? "bg-red-500/15 text-red-400" :
              data.status === "PARTIAL" ? "bg-amber-500/15 text-amber-400" :
              data.status === "PLANNED" ? "bg-sky-500/15 text-sky-400" :
              "bg-zinc-700/40 text-zinc-400"
            }`}>{data.status}</span>
            <span className="flex items-center gap-1 text-zinc-400">
              <Cable className="h-2.5 w-2.5" /> {linkCount}
              <span className="text-zinc-600">·</span>
              {data.interfaces ?? 0} intf
            </span>
          </div>
        </div>
        {(data.alarms ?? 0) > 0 && (
          <div className="flex items-center gap-0.5 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">
            <AlertTriangle className="h-3 w-3" />
            {data.alarms}
          </div>
        )}
      </div>
    </div>
  );
}

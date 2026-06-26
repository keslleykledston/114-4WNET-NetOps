import { useMemo, useState, type ReactElement } from "react";
import type { PortSpec, StencilSpec } from "./stencils";
import { PORT_STATUS_COLOR } from "./stencils";

interface Props {
  spec: StencilSpec;
  selectedPortId?: string | null;
  onSelectPort: (port: PortSpec, anchor: { x: number; y: number }) => void;
}

/**
 * Renders a faceplate stencil as inline SVG. Layout: two rows of ports,
 * grouped by `port.group`. Each port is a small rectangle (SFP-style cage)
 * with a colored inner fill (status) and a utilization bar at the bottom.
 */
export function DeviceStencil({ spec, selectedPortId, onSelectPort }: Props) {
  // Build columns: ports come pre-assigned to row 0/1; group consecutive 2 ports per column.
  const columns = useMemo(() => buildColumns(spec.ports), [spec.ports]);
  const downCount = useMemo(() => spec.ports.filter((p) => p.status === "down").length, [spec.ports]);

  const PORT_W = 22;
  const PORT_H = 22;
  const COL_W = PORT_W + 4;
  const ROW_GAP = 6;
  const GROUP_GAP = 14;

  // Compute width
  let cursor = 0;
  const colX: number[] = [];
  let lastGroup: string | undefined = undefined;
  columns.forEach((c) => {
    if (lastGroup !== undefined && c.group !== lastGroup) cursor += GROUP_GAP;
    colX.push(cursor);
    cursor += COL_W;
    lastGroup = c.group;
  });

  const portsWidth = cursor;
  const VENDOR_W = 150;
  const PAD_X = 18;
  const PAD_Y = 16;
  const W = VENDOR_W + portsWidth + PAD_X * 2 + 40;
  const H = PAD_Y * 2 + PORT_H * 2 + ROW_GAP + 28;

  return (
    <div className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block"
        style={{ minWidth: W }}
      >
        {/* Chassis */}
        <defs>
          <linearGradient id="chassis" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#22262d" />
            <stop offset="50%" stopColor={spec.faceColor} />
            <stop offset="100%" stopColor="#0c0e12" />
          </linearGradient>
          <linearGradient id="cage" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0a0a0a" />
            <stop offset="100%" stopColor="#1a1a1a" />
          </linearGradient>
        </defs>
        <rect
          x={2}
          y={2}
          width={W - 4}
          height={H - 4}
          rx={4}
          fill="url(#chassis)"
          stroke="#3f3f46"
          strokeWidth={1}
        />
        {/* Rack ears */}
        <rect x={2} y={2} width={10} height={H - 4} fill="#0a0c10" />
        <rect x={W - 12} y={2} width={10} height={H - 4} fill="#0a0c10" />
        {[6, H - 8].map((y, i) => (
          <circle key={i} cx={7} cy={y} r={1.5} fill="#2a2d33" />
        ))}
        {[6, H - 8].map((y, i) => (
          <circle key={`r${i}`} cx={W - 7} cy={y} r={1.5} fill="#2a2d33" />
        ))}

        {/* Vendor / model badge */}
        <g transform={`translate(${18}, ${H / 2 - 14})`}>
          <rect width={4} height={28} fill={spec.accentColor} rx={1} />
          <text
            x={12}
            y={12}
            fontFamily="ui-monospace, SFMono-Regular, monospace"
            fontSize={10}
            fill="#e4e4e7"
            fontWeight={700}
            letterSpacing={1.4}
          >
            {spec.vendor}
          </text>
          <text
            x={12}
            y={24}
            fontFamily="ui-monospace, SFMono-Regular, monospace"
            fontSize={9}
            fill="#a1a1aa"
            letterSpacing={1}
          >
            {spec.model}
          </text>
        </g>

        {/* Console / mgmt */}
        <g transform={`translate(${VENDOR_W + PAD_X - 26}, ${PAD_Y + 4})`}>
          <rect width={20} height={10} fill="#111" stroke="#3f3f46" rx={1} />
          <text x={10} y={22} fontSize={6.5} fill="#71717a" textAnchor="middle">CON</text>
          <rect y={28} width={20} height={10} fill="#111" stroke="#3f3f46" rx={1} />
          <text x={10} y={46} fontSize={6.5} fill="#71717a" textAnchor="middle">MGMT</text>
        </g>

        {/* Ports */}
        <g transform={`translate(${VENDOR_W + PAD_X}, ${PAD_Y})`}>
          {columns.map((col, ci) => (
            <g key={ci} transform={`translate(${colX[ci]}, 0)`}>
              {col.ports.map((p) => {
                const yBase = p.row === 0 ? 0 : PORT_H + ROW_GAP;
                return (
                  <PortCell
                    key={p.id}
                    port={p}
                    x={0}
                    y={yBase}
                    width={PORT_W}
                    height={PORT_H}
                    selected={selectedPortId === p.id}
                    onClick={(svgPoint) => onSelectPort(p, svgPoint)}
                  />
                );
              })}
              {/* column number label */}
              <text
                x={PORT_W / 2}
                y={PORT_H * 2 + ROW_GAP + 18}
                fontSize={7}
                fill="#71717a"
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
              >
                {col.ports.map((p) => p.label).join("·")}
              </text>
            </g>
          ))}
          {/* Group labels */}
          {renderGroupLabels(columns, colX, COL_W, GROUP_GAP, PORT_H * 2 + ROW_GAP + 6)}
        </g>

        {/* Status LEDs (sys/pwr/alarm) */}
        <g transform={`translate(${W - 38}, ${H / 2 - 10})`}>
          <Led y={0} color="#10b981" label="SYS" />
          <Led y={8} color="#10b981" label="PWR" />
          <Led y={16} color={downCount > 0 ? "#ef4444" : "#3f3f46"} label="ALM" />
        </g>
      </svg>
    </div>
  );
}

function Led({ y, color, label }: { y: number; color: string; label: string }) {
  return (
    <g transform={`translate(0, ${y})`}>
      <circle cx={0} cy={0} r={2} fill={color} />
      <text x={6} y={2} fontSize={6.5} fill="#71717a" fontFamily="ui-monospace, monospace">
        {label}
      </text>
    </g>
  );
}

function PortCell({
  port,
  x,
  y,
  width,
  height,
  selected,
  onClick,
}: {
  port: PortSpec;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
  onClick: (svgPoint: { x: number; y: number }) => void;
}) {
  const [hover, setHover] = useState(false);
  const c = PORT_STATUS_COLOR[port.status];
  const isQsfp = port.kind === "qsfp+" || port.kind === "qsfp28";
  const cageColor = "#0a0a0a";

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
        const ctm = (e.currentTarget as SVGGElement).getCTM();
        const cx = (ctm?.e ?? 0) + width / 2;
        const cy = (ctm?.f ?? 0) + height / 2;
        onClick({ x: rect.left + cx, y: rect.top + cy });
      }}
      style={{ cursor: "pointer" }}
    >
      <title>
        {`${port.ifname}\nStatus: ${c.label}\nVelocidade: ${port.speed}\nUtilização: ${port.utilPct}%`}
      </title>
      {/* Cage (SFP/QSFP body) */}
      <rect
        width={width}
        height={height}
        fill={cageColor}
        stroke={selected ? "#38bdf8" : hover ? "#71717a" : "#27272a"}
        strokeWidth={selected ? 1.5 : 1}
        rx={isQsfp ? 1.5 : 2}
      />
      {/* Inner cage highlight */}
      <rect x={1.5} y={1.5} width={width - 3} height={height - 3} fill="none" stroke="#1f1f23" />
      {/* Status fill */}
      <rect
        x={3}
        y={3}
        width={width - 6}
        height={height - 10}
        fill={c.fill}
        opacity={port.status === "idle" ? 0.35 : 0.9}
      />
      {port.status === "high" && (
        <rect x={3} y={3} width={width - 6} height={height - 10} fill="none"
          stroke="#fde68a" strokeWidth={0.6} />
      )}
      {port.status === "down" && (
        <rect
          x={1}
          y={1}
          width={width - 2}
          height={height - 2}
          fill="none"
          stroke={c.ring}
          strokeWidth={1.5}
          rx={isQsfp ? 1.5 : 2}
        />
      )}
      {/* Utilization bar */}
      <rect x={3} y={height - 5} width={width - 6} height={2} fill="#1f2937" />
      <rect
        x={3}
        y={height - 5}
        width={((width - 6) * Math.min(port.utilPct, 100)) / 100}
        height={2}
        fill={port.utilPct > 80 ? "#fbbf24" : port.utilPct > 50 ? "#38bdf8" : "#10b981"}
      />
      {(port.status !== "idle" || port.utilPct > 0) && (
        <text
          x={width / 2}
          y={height / 2 + 2}
          fontSize={6}
          textAnchor="middle"
          fill="#fafafa"
          fontFamily="ui-monospace, monospace"
          opacity={0.95}
        >
          {port.utilPct}%
        </text>
      )}
      {/* QSFP visual cue: 4 lane dots */}
      {isQsfp && (
        <g fill="#0a0a0a" opacity={0.55}>
          <circle cx={5} cy={6} r={0.6} />
          <circle cx={9} cy={6} r={0.6} />
          <circle cx={13} cy={6} r={0.6} />
          <circle cx={17} cy={6} r={0.6} />
        </g>
      )}
    </g>
  );
}

function buildColumns(ports: PortSpec[]): { group?: string; ports: PortSpec[] }[] {
  // Pair consecutive ports (i, i+1) into one column where i is row 0 and i+1 is row 1.
  const cols: { group?: string; ports: PortSpec[] }[] = [];
  for (let i = 0; i < ports.length; i += 2) {
    const a = ports[i];
    const b = ports[i + 1];
    cols.push({ group: a?.group, ports: b ? [a, b] : [a] });
  }
  return cols;
}

function renderGroupLabels(
  columns: { group?: string; ports: PortSpec[] }[],
  colX: number[],
  colW: number,
  groupGap: number,
  y: number,
) {
  const out: ReactElement[] = [];
  let start = 0;
  for (let i = 1; i <= columns.length; i++) {
    const prev = columns[i - 1]?.group;
    const cur = columns[i]?.group;
    if (i === columns.length || cur !== prev) {
      const x1 = colX[start];
      const x2 = colX[i - 1] + colW - 4;
      const mid = (x1 + x2) / 2;
      out.push(
        <g key={`grp-${start}-${i}`}>
          <line x1={x1} x2={x2} y1={y + 14} y2={y + 14} stroke="#3f3f46" strokeWidth={0.5} />
          <text x={mid} y={y + 22} textAnchor="middle" fontSize={7} fill="#52525b"
            fontFamily="ui-monospace, monospace" letterSpacing={1}>
            {prev ?? ""}
          </text>
        </g>,
      );
      start = i;
    }
  }
  // suppress unused warning
  void groupGap;
  return out;
}
import type { EdgeType, NodeStatus } from "@/lib/network-map/types";

export function utilizationStroke(utilizationPct: number | null | undefined): string | null {
  if (utilizationPct == null) return null;
  if (utilizationPct >= 85) return "#ef4444";
  if (utilizationPct >= 65) return "#f97316";
  if (utilizationPct >= 45) return "#f59e0b";
  if (utilizationPct >= 20) return "#10b981";
  return "#22c55e";
}

export function edgeStyle(
  edgeType: EdgeType,
  status: NodeStatus,
  utilizationPct?: number | null,
) {
  const base: React.CSSProperties = { strokeWidth: 1.5 };

  let stroke = "#71717a";
  if (status === "UP") stroke = "#10b981";
  if (status === "PARTIAL") stroke = "#f59e0b";
  if (status === "DOWN") stroke = "#ef4444";
  if (status === "UNKNOWN") stroke = "#71717a";

  const utilStroke = utilizationStroke(utilizationPct);
  if (utilStroke && (edgeType === "physical" || edgeType === "lag" || edgeType === "manual")) {
    stroke = utilStroke;
  }

  switch (edgeType) {
    case "physical":
      base.strokeWidth = utilStroke ? 3 : 2;
      break;
    case "lag":
      base.strokeWidth = utilStroke ? 4 : 3.5;
      break;
    case "bgp":
      if (!utilStroke) stroke = "#a78bfa";
      base.strokeWidth = 2;
      break;
    case "service":
      if (!utilStroke) stroke = "#60a5fa";
      base.strokeWidth = 2;
      break;
    case "optical":
      if (!utilStroke) stroke = "#fb923c";
      base.strokeWidth = 2.5;
      break;
    case "planned":
      stroke = "#38bdf8";
      base.strokeDasharray = "6 4";
      break;
    case "manual":
      if (!utilStroke) stroke = "#a1a1aa";
      base.strokeDasharray = "2 3";
      break;
  }
  if (status === "DOWN") stroke = "#ef4444";
  if (status === "PARTIAL" && edgeType !== "bgp" && edgeType !== "service" && !utilStroke) {
    stroke = "#f59e0b";
  }

  return { ...base, stroke };
}

export function edgeLabel(edgeType: EdgeType, capacity: string, utilizationPct?: number | null): string {
  const base = edgeType === "bgp"
    ? `BGP ${capacity}`
    : edgeType === "service"
      ? `L2VC ${capacity}`
      : edgeType === "optical"
        ? `DWDM ${capacity}`
        : edgeType === "lag"
          ? `LAG ${capacity}`
          : capacity;

  if (utilizationPct != null) return `${base} · ${utilizationPct}%`;
  return base;
}

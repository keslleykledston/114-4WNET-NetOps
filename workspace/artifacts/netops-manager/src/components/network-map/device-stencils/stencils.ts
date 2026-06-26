import type { DeviceData } from "@/lib/network-map/types";
import {
  genericStencilEntry,
  resolveStencilLibraryEntry,
  type PortLayoutBlock,
  type SnmpStencilHints,
} from "./device-stencil-library";

export type PortKind = "sfp+" | "sfp28" | "qsfp+" | "qsfp28" | "rj45" | "console" | "mgmt";
export type PortStatus = "up" | "down" | "high" | "idle" | "maint";

export interface PortSpec {
  id: string;
  label: string;
  ifname: string;
  kind: PortKind;
  row: 0 | 1;
  group?: string;
  status: PortStatus;
  speed: string;
  utilPct: number;
  neighbor?: string;
  description?: string;
}

export interface StencilSpec {
  model: string;
  vendor: string;
  family: "huawei-s6730" | "huawei-s6750" | "datacom-dm4370" | "raisecom-rax751" | "generic-1u";
  height: 1 | 2;
  rackUnits: string;
  faceColor: string;
  accentColor: string;
  vendorLabel: string;
  ports: PortSpec[];
}

export interface LivePortMetrics {
  operStatus?: "up" | "down" | "unknown";
  adminStatus?: "up" | "down" | "unknown";
  utilPct?: number | null;
  description?: string | null;
  speedMbps?: number | null;
}

function formatSpeed(mbps: number | null | undefined, fallback: string): string {
  if (mbps == null || mbps <= 0) return fallback;
  if (mbps >= 1000) return `${Math.round(mbps / 1000)}G`;
  return `${mbps}M`;
}

export function portStatusFromLive(
  live: LivePortMetrics | undefined,
  deviceDown: boolean,
): PortStatus {
  if (deviceDown) return "down";
  if (!live) return "idle";
  if (live.adminStatus === "down" && live.operStatus !== "up") return "maint";
  if (live.operStatus === "down") return "down";
  if (live.utilPct != null && live.utilPct >= 80) return "high";
  if (live.operStatus === "up") return live.utilPct != null && live.utilPct >= 50 ? "high" : "up";
  return "idle";
}

function speedFamilyRegex(block: PortLayoutBlock): RegExp {
  switch (block.speed) {
    case "400G":
      return /^400GE/i;
    case "100G":
      return /^100GE/i;
    case "40G":
      return /^40GE/i;
    case "25G":
      return /^(25GE|10GE)/i;
    case "10G":
      return /^(10GE|TenGig|GigabitEthernet|xe-|TenGigE)/i;
    case "1G":
      return /^(GigabitEthernet|GigaEthernet|FastEthernet|GE|Eth)/i;
    default:
      return new RegExp(`^${block.ifPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  }
}

function trailingPortNum(ifname: string): string | null {
  const m = ifname.match(/(\d+)\s*$/);
  return m?.[1] ?? null;
}

function resolveBlockIfnames(
  block: PortLayoutBlock,
  physicalIfNames: string[],
): string[] {
  const family = speedFamilyRegex(block);
  const matches = physicalIfNames
    .filter((n) => family.test(n))
    .sort((a, b) => {
      const ai = Number(trailingPortNum(a) ?? 0);
      const bi = Number(trailingPortNum(b) ?? 0);
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });

  const out: string[] = [];
  for (let i = 0; i < block.count; i++) {
    const n = block.startIdx + i;
    const live = matches[i];
    out.push(live ?? `${block.ifPrefix}${n}`);
  }
  return out;
}

function findLiveMetrics(
  ifname: string,
  livePorts?: Map<string, LivePortMetrics>,
): LivePortMetrics | undefined {
  if (!livePorts?.size) return undefined;
  if (livePorts.has(ifname)) return livePorts.get(ifname);
  const lower = ifname.toLowerCase();
  for (const [key, value] of livePorts) {
    if (key.toLowerCase() === lower) return value;
  }
  const suffix = trailingPortNum(ifname);
  if (suffix) {
    for (const [key, value] of livePorts) {
      if (trailingPortNum(key) === suffix && key.match(/^(10|25|40|100|400)GE/i)?.[0] === ifname.match(/^(10|25|40|100|400)GE/i)?.[0]) {
        return value;
      }
    }
  }
  return undefined;
}

function buildPortsFromLayout(
  layout: PortLayoutBlock[],
  deviceDown: boolean,
  livePorts?: Map<string, LivePortMetrics>,
  physicalIfNames?: string[],
): PortSpec[] {
  const out: PortSpec[] = [];
  let rowToggle = 0;
  const physical = physicalIfNames ?? [];

  for (const block of layout) {
    const ifnames = physical.length > 0 ? resolveBlockIfnames(block, physical) : [];
    for (let i = 0; i < block.count; i++) {
      const n = block.startIdx + i;
      const ifname = ifnames[i] ?? `${block.ifPrefix}${n}`;
      const live = findLiveMetrics(ifname, livePorts);
      const hasLive = Boolean(live);
      const status = hasLive ? portStatusFromLive(live, deviceDown) : (deviceDown ? "down" : "idle");
      const utilPct = live?.utilPct ?? 0;

      out.push({
        id: `p${n}`,
        label: trailingPortNum(ifname) ?? String(n),
        ifname,
        kind: block.kind,
        row: (rowToggle++ % 2) as 0 | 1,
        group: block.group,
        status,
        speed: formatSpeed(live?.speedMbps, block.speed),
        utilPct: Math.min(100, Math.max(0, utilPct)),
        description: live?.description ?? undefined,
      });
    }
  }

  return out;
}

export function buildLivePortMap(
  interfaces: Array<{
    name: string;
    operStatus?: "up" | "down" | "unknown";
    adminStatus?: "up" | "down" | "unknown";
    description?: string | null;
    highSpeedMbps?: number | null;
    kind?: string;
    ifIndex?: number;
  }>,
  utilByName: Record<string, number> = {},
): Map<string, LivePortMetrics> {
  const map = new Map<string, LivePortMetrics>();
  for (const iface of interfaces) {
    if (iface.kind && iface.kind !== "physical") continue;
    map.set(iface.name, {
      operStatus: iface.operStatus,
      adminStatus: iface.adminStatus,
      description: iface.description ?? null,
      speedMbps: iface.highSpeedMbps ?? null,
      utilPct: utilByName[iface.name] ?? null,
    });
  }
  return map;
}

export function physicalIfNamesFromInterfaces(
  interfaces: Array<{ name: string; kind?: string; ifIndex?: number }>,
): string[] {
  return interfaces
    .filter((i) => !i.kind || i.kind === "physical" || /^(?:10|25|40|100|400)GE\d/i.test(i.name))
    .sort((a, b) => (a.ifIndex ?? 0) - (b.ifIndex ?? 0))
    .map((i) => i.name);
}

export function buildStencil(
  d: DeviceData,
  livePorts?: Map<string, LivePortMetrics>,
  snmpHints?: SnmpStencilHints,
): StencilSpec {
  const deviceDown = d.status === "DOWN";
  const physical = snmpHints?.physicalIfNames ?? [];
  const hintsWithPhysical = physical.length > 0 ? snmpHints : snmpHints;
  const entry = resolveStencilLibraryEntry(d, hintsWithPhysical)
    ?? genericStencilEntry(d, d.interfaces ?? 24, snmpHints);

  return {
    model: entry.model,
    vendor: entry.vendor,
    family: entry.family,
    height: entry.height,
    rackUnits: entry.rackUnits,
    faceColor: entry.faceColor,
    accentColor: entry.accentColor,
    vendorLabel: entry.vendorLabel,
    ports: buildPortsFromLayout(entry.portLayout, deviceDown, livePorts, physical),
  };
}

export const PORT_STATUS_COLOR: Record<PortStatus, { fill: string; ring: string; label: string }> = {
  up: { fill: "#10b981", ring: "#34d399", label: "UP" },
  down: { fill: "#ef4444", ring: "#f87171", label: "DOWN" },
  high: { fill: "#f59e0b", ring: "#fbbf24", label: "Alto uso" },
  idle: { fill: "#3f3f46", ring: "#52525b", label: "Sem link" },
  maint: { fill: "#8b5cf6", ring: "#a78bfa", label: "Manutenção" },
};

import type { DeviceData } from "@/lib/network-map/types";
import type { PortKind, StencilSpec } from "./stencils";

export interface PortLayoutBlock {
  count: number;
  kind: PortKind;
  startIdx: number;
  ifPrefix: string;
  speed: string;
  group?: string;
}

export interface StencilLibraryEntry {
  id: string;
  match: RegExp;
  model: string;
  vendor: string;
  family: StencilSpec["family"];
  vendorLabel: string;
  faceColor: string;
  accentColor: string;
  height: 1 | 2;
  rackUnits: string;
  portLayout: PortLayoutBlock[];
}

/** Faceplate library aligned with NetOps device-profile-library models */
export const DEVICE_STENCIL_LIBRARY: StencilLibraryEntry[] = [
  {
    id: "huawei-ne8000",
    match: /ne8000|ne-?8000/i,
    model: "NE8000",
    vendor: "HUAWEI",
    family: "generic-1u",
    vendorLabel: "HUAWEI  NE8000",
    faceColor: "#1a1d24",
    accentColor: "#c41230",
    height: 2,
    rackUnits: "2U",
    portLayout: [
      { count: 36, kind: "qsfp28", startIdx: 1, ifPrefix: "100GE0/0/", speed: "100G", group: "100GE" },
      { count: 4, kind: "qsfp28", startIdx: 37, ifPrefix: "400GE0/0/", speed: "400G", group: "400GE" },
    ],
  },
  {
    id: "huawei-s6730",
    match: /s6730(?!.*40g)/i,
    model: "S6730-H24X6C",
    vendor: "HUAWEI",
    family: "huawei-s6730",
    vendorLabel: "HUAWEI  S6730",
    faceColor: "#1a1d24",
    accentColor: "#c41230",
    height: 1,
    rackUnits: "1U",
    portLayout: [
      { count: 24, kind: "sfp+", startIdx: 1, ifPrefix: "10GE0/0/", speed: "10G", group: "SFP+" },
      { count: 6, kind: "qsfp28", startIdx: 25, ifPrefix: "100GE0/0/", speed: "100G", group: "QSFP28" },
    ],
  },
  {
    id: "huawei-s6730-40g",
    match: /s6730.*40g|s6730-?\d+x40g|h48y6c/i,
    model: "S6730-40GE",
    vendor: "HUAWEI",
    family: "huawei-s6730",
    vendorLabel: "HUAWEI  S6730",
    faceColor: "#1a1d24",
    accentColor: "#c41230",
    height: 1,
    rackUnits: "1U",
    portLayout: [
      { count: 24, kind: "sfp+", startIdx: 1, ifPrefix: "10GE0/0/", speed: "10G", group: "SFP+" },
      { count: 6, kind: "qsfp28", startIdx: 25, ifPrefix: "40GE0/0/", speed: "40G", group: "40GE" },
    ],
  },
  {
    id: "huawei-s6730-48x40g",
    match: /s6730-?54x40g|s6730-?48x40g/i,
    model: "S6730-48X40G",
    vendor: "HUAWEI",
    family: "huawei-s6730",
    vendorLabel: "HUAWEI  S6730",
    faceColor: "#1a1d24",
    accentColor: "#c41230",
    height: 1,
    rackUnits: "1U",
    portLayout: [
      { count: 48, kind: "sfp28", startIdx: 1, ifPrefix: "25GE0/0/", speed: "25G", group: "25GE" },
      { count: 6, kind: "qsfp28", startIdx: 49, ifPrefix: "40GE0/0/", speed: "40G", group: "40GE" },
    ],
  },
  {
    id: "huawei-s6750",
    match: /s6750/i,
    model: "S6750-H48Y8C",
    vendor: "HUAWEI",
    family: "huawei-s6750",
    vendorLabel: "HUAWEI  S6750",
    faceColor: "#1a1d24",
    accentColor: "#c41230",
    height: 1,
    rackUnits: "1U",
    portLayout: [
      { count: 48, kind: "sfp28", startIdx: 1, ifPrefix: "25GE0/0/", speed: "25G", group: "SFP28" },
      { count: 8, kind: "qsfp28", startIdx: 49, ifPrefix: "100GE0/0/", speed: "100G", group: "QSFP28" },
    ],
  },
  {
    id: "huawei-ce",
    match: /ce\d|cloudengine/i,
    model: "CloudEngine",
    vendor: "HUAWEI",
    family: "generic-1u",
    vendorLabel: "HUAWEI  CloudEngine",
    faceColor: "#1a1d24",
    accentColor: "#c41230",
    height: 1,
    rackUnits: "1U",
    portLayout: [
      { count: 48, kind: "sfp28", startIdx: 1, ifPrefix: "25GE1/0/", speed: "25G", group: "25GE" },
      { count: 6, kind: "qsfp28", startIdx: 49, ifPrefix: "100GE1/0/", speed: "100G", group: "100GE" },
    ],
  },
  {
    id: "cisco-asr",
    match: /asr\d/i,
    model: "ASR1000",
    vendor: "CISCO",
    family: "generic-1u",
    vendorLabel: "CISCO  ASR",
    faceColor: "#0f1419",
    accentColor: "#049fd9",
    height: 2,
    rackUnits: "2U",
    portLayout: [
      { count: 4, kind: "qsfp28", startIdx: 1, ifPrefix: "HundredGigE0/0/", speed: "100G" },
      { count: 8, kind: "sfp+", startIdx: 5, ifPrefix: "TenGigE0/0/", speed: "10G" },
    ],
  },
  {
    id: "juniper-mx",
    match: /mx\d|mx204|mx480/i,
    model: "MX",
    vendor: "JUNIPER",
    family: "generic-1u",
    vendorLabel: "JUNIPER  MX",
    faceColor: "#111318",
    accentColor: "#84bd00",
    height: 2,
    rackUnits: "2U",
    portLayout: [
      { count: 8, kind: "qsfp28", startIdx: 1, ifPrefix: "et-0/0/", speed: "100G" },
      { count: 16, kind: "sfp28", startIdx: 9, ifPrefix: "xe-0/0/", speed: "10G" },
    ],
  },
  {
    id: "datacom-dm4370",
    match: /dm4370|dm43\d/i,
    model: "DM4370",
    vendor: "DATACOM",
    family: "datacom-dm4370",
    vendorLabel: "DATACOM  DM4370",
    faceColor: "#0f1216",
    accentColor: "#00a651",
    height: 1,
    rackUnits: "1U",
    portLayout: [
      { count: 24, kind: "sfp+", startIdx: 1, ifPrefix: "ten-gigabit-ethernet-1/1/", speed: "10G", group: "SFP+" },
      { count: 4, kind: "qsfp28", startIdx: 25, ifPrefix: "hundred-gigabit-ethernet-1/1/", speed: "100G", group: "QSFP28" },
    ],
  },
  {
    id: "raisecom-rax751",
    match: /rax\s*751|rax751/i,
    model: "RAX 751",
    vendor: "RAISECOM",
    family: "raisecom-rax751",
    vendorLabel: "RAISECOM  RAX 751",
    faceColor: "#101317",
    accentColor: "#0067b1",
    height: 1,
    rackUnits: "1U",
    portLayout: [
      { count: 8, kind: "sfp+", startIdx: 1, ifPrefix: "GigaEthernet1/0/", speed: "10G", group: "SFP+" },
      { count: 4, kind: "rj45", startIdx: 9, ifPrefix: "FastEthernet1/0/", speed: "1G", group: "RJ45" },
    ],
  },
  {
    id: "raisecom-iscom",
    match: /iscom/i,
    model: "ISCOM",
    vendor: "RAISECOM",
    family: "generic-1u",
    vendorLabel: "RAISECOM  ISCOM",
    faceColor: "#101317",
    accentColor: "#0067b1",
    height: 1,
    rackUnits: "1U",
    portLayout: [
      { count: 24, kind: "sfp+", startIdx: 1, ifPrefix: "GigaEthernet0/0/", speed: "1G" },
      { count: 4, kind: "sfp+", startIdx: 25, ifPrefix: "TenGigabitEthernet0/0/", speed: "10G" },
    ],
  },
];

export interface SnmpStencilHints {
  /** Inventory/discovery platform (SNMP-derived), e.g. VRP, S6730-H24X6C */
  platform?: string | null;
  /** Optional sysDescr snippet from SNMP preflight/snapshot */
  sysDescr?: string | null;
  /** Physical interface names from SNMP/SSH discovery (ifName) */
  physicalIfNames?: string[];
}

function physicalIfNamesFromHints(snmpHints?: SnmpStencilHints): string[] {
  return snmpHints?.physicalIfNames?.filter(Boolean) ?? [];
}

function hasIfPrefix(names: string[], prefix: RegExp): boolean {
  return names.some((n) => prefix.test(n));
}

function countIfPrefix(names: string[], prefix: RegExp): number {
  return names.filter((n) => prefix.test(n)).length;
}

/** Infer faceplate from live ifName patterns when platform/sysDescr is generic (e.g. VRP). */
function resolveFromPhysicalIfNames(physical: string[]): StencilLibraryEntry | null {
  if (physical.length === 0) return null;

  const has100 = hasIfPrefix(physical, /^100GE/i);
  const has40 = hasIfPrefix(physical, /^40GE/i);
  const has400 = hasIfPrefix(physical, /^400GE/i);
  const has10Slot0 = hasIfPrefix(physical, /^10GE0\/0\//i);
  const has25Slot0 = hasIfPrefix(physical, /^25GE0\/0\//i);
  const uplink100Slot0 = countIfPrefix(physical, /^100GE0\/0\//i);
  const ne8000Style100 = has100 && physical.some((n) => /^100GE\d+\/(?!0\/)/i.test(n));

  if (has400 || (has100 && ne8000Style100 && !has10Slot0 && !has40 && !has25Slot0)) {
    return DEVICE_STENCIL_LIBRARY.find((e) => e.id === "huawei-ne8000") ?? null;
  }
  if (has25Slot0 && has40) {
    return DEVICE_STENCIL_LIBRARY.find((e) => e.id === "huawei-s6730-48x40g") ?? null;
  }
  if (has40 && !has100) {
    return DEVICE_STENCIL_LIBRARY.find((e) => e.id === "huawei-s6730-40g") ?? null;
  }
  if (has100 && (has10Slot0 || uplink100Slot0 > 0 && uplink100Slot0 <= 8)) {
    return DEVICE_STENCIL_LIBRARY.find((e) => e.id === "huawei-s6730") ?? null;
  }
  return null;
}

export function resolveStencilLibraryEntry(
  device: DeviceData,
  snmpHints?: SnmpStencilHints,
): StencilLibraryEntry | null {
  const physical = physicalIfNamesFromHints(snmpHints);
  const blob = [device.vendor, device.name, snmpHints?.platform ?? device.model, snmpHints?.sysDescr]
    .filter(Boolean)
    .join(" ")
    .trim();

  const fromIfNames = resolveFromPhysicalIfNames(physical);
  if (fromIfNames) return fromIfNames;

  if (/s6730/i.test(blob) || physical.some((n) => /^10GE0\/0\//i.test(n))) {
    if (/54x40g|48x40g/i.test(blob)) {
      return DEVICE_STENCIL_LIBRARY.find((e) => e.id === "huawei-s6730-48x40g") ?? null;
    }
    const prefers40g = /40g|x40g|h48y6c/i.test(blob)
      || (hasIfPrefix(physical, /^40GE/i) && !hasIfPrefix(physical, /^100GE/i));
    if (prefers40g) {
      return DEVICE_STENCIL_LIBRARY.find((e) => e.id === "huawei-s6730-40g") ?? null;
    }
    return DEVICE_STENCIL_LIBRARY.find((e) => e.id === "huawei-s6730") ?? null;
  }

  for (const entry of DEVICE_STENCIL_LIBRARY) {
    if (entry.match.test(blob)) return entry;
  }
  return null;
}

export function genericStencilEntry(
  device: DeviceData,
  portCount: number,
  snmpHints?: SnmpStencilHints,
): StencilLibraryEntry {
  const count = Math.max(8, Math.min(48, portCount || 24));
  const model = snmpHints?.platform ?? device.model ?? "Generic";
  return {
    id: "generic",
    match: /.*/,
    model,
    vendor: device.vendor.toUpperCase(),
    family: "generic-1u",
    vendorLabel: `${device.vendor}  ${model}`.trim(),
    faceColor: "#15181d",
    accentColor: "#3b82f6",
    height: 1,
    rackUnits: "1U",
    portLayout: [{ count, kind: "sfp+", startIdx: 1, ifPrefix: "Eth", speed: "10G" }],
  };
}

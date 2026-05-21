import type { SnmpCollectedInterface } from "../snmp/types.js";
import type { InterfaceKind, NormalizedInterface } from "./types.js";

export function classifyInterface(iface: SnmpCollectedInterface): InterfaceKind {
  const name = iface.name.toLowerCase();

  if (name.includes("loopback") || name.match(/^lo\d+$/)) return "loopback";
  if (name.includes("tunnel") || name.match(/^tunnel\d+$/)) return "tunnel";
  if (name.match(/^vlan\d+$/i) || name.match(/^vlanif\d+$/i)) return "vlanif";
  if (name.includes("virtual-template") || name.match(/^virtual-template\d+$/i)) return "virtual_template";
  if (name === "null" || name.includes("null0")) return "null";
  if (name.includes("eth-trunk") || name.includes("bundle")) return "aggregate";
  if (name.match(/\.\d+$/) || name.includes("subif")) return "subinterface";

  return "physical";
}

function extractSubinterfaceInfo(name: string): { parent: string; vlanId: number } | null {
  const match = name.match(/^(.+?)\.(\d+)$/);
  if (!match) return null;

  return {
    parent: match[1],
    vlanId: Number(match[2]),
  };
}

export function normalizeInterface(raw: SnmpCollectedInterface): NormalizedInterface {
  const kind = classifyInterface(raw);
  const subifInfo = kind === "subinterface" ? extractSubinterfaceInfo(raw.name) : null;

  const description = raw.alias || raw.description || null;

  return {
    ifIndex: raw.ifIndex,
    name: raw.name,
    description,
    alias: raw.alias,
    rawDescr: raw.description,
    adminStatus: raw.adminStatus,
    operStatus: raw.operStatus,
    type: raw.type,
    mtu: raw.mtu,
    speed: raw.speed,
    mac: raw.mac,
    inOctets: raw.inOctets,
    outOctets: raw.outOctets,
    source: "snmp",
    kind,
    parentInterface: subifInfo?.parent,
    vlanId: subifInfo?.vlanId,
    encapsulation: kind === "subinterface" ? "dot1q" : undefined,
  };
}

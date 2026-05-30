import type { NetopsInterface } from "../../types.js";
import { isHuaweiInterfaceName } from "../../../compliance/interface-identifiers.js";
import { normalizeServiceVlanId } from "../../service-vlan-policy.js";

function normalizeStatus(value: string | undefined): NetopsInterface["operStatus"] {
  const normalized = value?.toLowerCase();
  if (normalized === "up") return "up";
  if (normalized === "down") return "down";
  return "unknown";
}

function extractVlan(name: string): number | null {
  const match = name.match(/\.(\d{1,4})$/);
  return match ? normalizeServiceVlanId(match[1]) : null;
}

function inferKind(name: string): NetopsInterface["kind"] {
  if (/^vlanif\d+/i.test(name)) return "vlanif";
  if (/^loopback\d*/i.test(name)) return "loopback";
  if (/^(eth-trunk|bridge-aggregation|port-channel)\d+/i.test(name)) return "aggregate";
  if (name.includes(".")) return "subinterface";
  if (/^(null|unet|lo)\d*/i.test(name)) return "null";
  return "physical";
}

export function parseHuaweiInterfaces(output: string): NetopsInterface[] {
  const interfaces: NetopsInterface[] = [];
  let current: NetopsInterface | null = null;

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      current = null;
      continue;
    }

    const header = trimmed.match(/^interface\s+(\S+)/i);
    if (header && isHuaweiInterfaceName(header[1])) {
      current = {
        name: header[1],
        description: null,
        alias: undefined,
        rawDescr: undefined,
        adminStatus: "unknown",
        operStatus: "unknown",
        ipv4: [],
        ipv6: [],
        vlan: extractVlan(header[1]),
        vrf: null,
        source: "ssh",
        kind: inferKind(header[1]),
      };
      interfaces.push(current);
      continue;
    }
    if (header) {
      current = null;
      continue;
    }

    if (!current && /^phy\b|^vpn-instance\b/i.test(trimmed)) continue;
    if (current && /^description\b/i.test(trimmed)) {
      current.description = trimmed.replace(/^description\s+/i, "").trim() || null;
      continue;
    }
    if (current && /^shutdown\b/i.test(trimmed)) {
      current.adminStatus = "down";
      continue;
    }
    if (current && /^undo shutdown\b/i.test(trimmed)) {
      current.adminStatus = "up";
      continue;
    }
    if (current && /^encapsulation\s+dot1q\s+(\d+)/i.test(trimmed)) {
      const vlan = normalizeServiceVlanId(trimmed.match(/^encapsulation\s+dot1q\s+(\d+)/i)?.[1]);
      if (vlan !== null) {
        current.vlanId = vlan;
        current.vlan = current.vlan ?? vlan;
        current.encapsulation = `dot1q ${vlan}`;
      }
      continue;
    }
    if (current && /^vlan-type\s+dot1q\s+(\d+)/i.test(trimmed)) {
      const vlan = normalizeServiceVlanId(trimmed.match(/^vlan-type\s+dot1q\s+(\d+)/i)?.[1]);
      if (vlan !== null) {
        current.vlanId = vlan;
        current.vlan = current.vlan ?? vlan;
        current.encapsulation = `dot1q ${vlan}`;
      }
      continue;
    }
    if (current && /^encapsulation\s+qinq\s+vlan\s+(\d+)\s+to\s+(\d+)/i.test(trimmed)) {
      const match = trimmed.match(/^encapsulation\s+qinq\s+vlan\s+(\d+)\s+to\s+(\d+)/i);
      if (match) current.encapsulation = `qinq vlan ${match[1]} to ${match[2]}`;
      continue;
    }
    if (current && /^ip\s+binding\s+vpn-instance\s+(\S+)/i.test(trimmed)) {
      current.vrf = trimmed.match(/^ip\s+binding\s+vpn-instance\s+(\S+)/i)?.[1] ?? current.vrf;
      continue;
    }

    const brief = trimmed.match(/^(\S+)\s+(\S+)\s+(\S+)(?:\s+(.+))?$/);
    if (!brief) continue;

    const [, name, admin, oper, rest] = brief;
    if (!isHuaweiInterfaceName(name)) continue;

    interfaces.push({
      name,
      description: rest?.trim() || null,
      alias: undefined,
      rawDescr: undefined,
      adminStatus: normalizeStatus(admin),
      operStatus: normalizeStatus(oper),
      ipv4: [],
      ipv6: [],
      vlan: extractVlan(name),
      vrf: null,
      source: "ssh",
      kind: inferKind(name),
    });
  }

  return interfaces;
}

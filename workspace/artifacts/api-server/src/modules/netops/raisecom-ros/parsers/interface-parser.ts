import type { NetopsInterface } from "../../types.js";
import { normalizeServiceVlanId } from "../../service-vlan-policy.js";

function normalizeStatus(value: string | undefined): NetopsInterface["operStatus"] {
  const normalized = value?.toLowerCase();
  if (normalized === "up") return "up";
  if (normalized === "down") return "down";
  return "unknown";
}

function extractVlan(name: string): number | null {
  const vlanMatch = name.match(/(?:vlanif|vlan)(\d+)/i);
  if (vlanMatch) return normalizeServiceVlanId(vlanMatch[1]);
  const dot1q = name.match(/\.(\d{1,4})$/);
  return dot1q ? normalizeServiceVlanId(dot1q[1]) : null;
}

function inferKind(name: string): NetopsInterface["kind"] {
  if (/^vlanif\d+|^vlan\d+/i.test(name)) return "vlanif";
  if (/^loopback\d*/i.test(name)) return "loopback";
  if (/^(port-channel|eth-trunk)\d+/i.test(name)) return "aggregate";
  if (name.includes(".")) return "subinterface";
  return "physical";
}

export function parseRaisecomInterfaces(output: string): NetopsInterface[] {
  const interfaces = new Map<string, NetopsInterface>();
  let currentName: string | null = null;

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      currentName = null;
      continue;
    }

    const headerMatch = trimmed.match(/^interface\s+(\S+)/i);
    if (headerMatch) {
      const name = headerMatch[1];
      currentName = name;
      interfaces.set(name, {
        name,
        description: null,
        alias: undefined,
        rawDescr: undefined,
        adminStatus: "unknown",
        operStatus: "unknown",
        ipv4: [],
        ipv6: [],
        vlan: extractVlan(name),
        vrf: null,
        source: "ssh",
        kind: inferKind(name),
      });
      continue;
    }

    const showInterfaceMatch = trimmed.match(/^(\S+)\s+is\s+(up|down),\s*line protocol is\s+(up|down)/i);
    if (showInterfaceMatch) {
      const [, name, admin, oper] = showInterfaceMatch;
      const existing = interfaces.get(name);
      interfaces.set(name, {
        ...(existing ?? {
          name,
          description: null,
          alias: undefined,
          rawDescr: undefined,
          ipv4: [],
          ipv6: [],
          vlan: extractVlan(name),
          vrf: null,
          source: "ssh" as const,
          kind: inferKind(name),
        }),
        adminStatus: normalizeStatus(admin),
        operStatus: normalizeStatus(oper),
      });
      currentName = name;
      continue;
    }

    const briefMatch = trimmed.match(/^(\S+)\s+(\d{1,3}(?:\.\d{1,3}){3}|unassigned)\s+\S+\s+\S+\s+(up|down)\s+(up|down)$/i);
    if (briefMatch) {
      const [, name, ipValue, admin, oper] = briefMatch;
      const existing = interfaces.get(name);
      const ipv4 = ipValue.toLowerCase() !== "unassigned" ? [ipValue] : [];
      interfaces.set(name, {
        ...(existing ?? {
          name,
          description: null,
          alias: undefined,
          rawDescr: undefined,
          ipv4: [],
          ipv6: [],
          vlan: extractVlan(name),
          vrf: null,
          source: "ssh" as const,
          kind: inferKind(name),
        }),
        adminStatus: normalizeStatus(admin),
        operStatus: normalizeStatus(oper),
        ipv4: ipv4.length > 0 ? ipv4 : existing?.ipv4 ?? [],
      });
      currentName = null;
      continue;
    }

    const descriptionMatch = trimmed.match(/^description\s+(.+)/i);
    if (currentName && descriptionMatch) {
      const current = interfaces.get(currentName);
      if (current) {
        current.description = descriptionMatch[1].trim() || null;
        interfaces.set(currentName, current);
      }
      continue;
    }

    if (currentName && /^shutdown$/i.test(trimmed)) {
      const current = interfaces.get(currentName);
      if (current) {
        current.adminStatus = "down";
        interfaces.set(currentName, current);
      }
      continue;
    }
    if (currentName && /^no shutdown$/i.test(trimmed)) {
      const current = interfaces.get(currentName);
      if (current) {
        current.adminStatus = "up";
        interfaces.set(currentName, current);
      }
      continue;
    }
  }

  return [...interfaces.values()].sort((left, right) => left.name.localeCompare(right.name));
}

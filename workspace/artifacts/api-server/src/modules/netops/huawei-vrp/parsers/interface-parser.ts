import type { NetopsInterface } from "../../types.js";

function normalizeStatus(value: string | undefined): NetopsInterface["operStatus"] {
  const normalized = value?.toLowerCase();
  if (normalized === "up") return "up";
  if (normalized === "down") return "down";
  return "unknown";
}

function extractVlan(name: string): number | null {
  const match = name.match(/\.(\d{1,4})$/);
  return match ? Number(match[1]) : null;
}

export function parseHuaweiInterfaces(output: string): NetopsInterface[] {
  const interfaces: NetopsInterface[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^interface\b|^phy\b|^vpn-instance\b/i.test(trimmed)) continue;

    const brief = trimmed.match(/^(\S+)\s+(\S+)\s+(\S+)(?:\s+(.+))?$/);
    if (!brief) continue;

    const [, name, admin, oper, rest] = brief;
    interfaces.push({
      name,
      description: rest?.trim() || null,
      adminStatus: normalizeStatus(admin),
      operStatus: normalizeStatus(oper),
      ipv4: [],
      ipv6: [],
      vlan: extractVlan(name),
      vrf: null,
      source: "ssh",
    });
  }

  return interfaces;
}

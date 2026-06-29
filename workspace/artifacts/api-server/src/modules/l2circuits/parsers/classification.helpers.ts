import type { L2DeviceRoleFamily, ParsedL2Circuit } from "../l2circuits.types.js";
import { normalizeServiceVlanId } from "../../netops/service-vlan-policy.js";

export interface ParserContext {
  deviceRoleFamily: L2DeviceRoleFamily;
  globalVlans?: Set<number>;
  hasGlobalVlanEvidence?: boolean;
  switchingVlans?: Set<number>;
  macVlans?: Set<number>;
  l2vcClientInterfaces?: Set<string>;
  vsiInterfaces?: Set<string>;
}

export function inferDeviceRoleFamily(rawOutputs: Record<string, string | undefined>): L2DeviceRoleFamily {
  const haystack = Object.values(rawOutputs).filter(Boolean).join("\n").slice(0, 20000);
  const hostname = haystack.match(/^\s*#?\s*hostname=([^\s]+)/im)?.[1] ?? "";
  if (/NE(?:40|8000|\d{1,4})|BRT-RX/i.test(hostname)) return "ROUTER";
  if (/S(?:5700|6700|6720|6730)/i.test(hostname)) return "SWITCH";
  if (/NE(?:40|8000|\d{1,4})/i.test(haystack) || /BRT-RX/i.test(haystack)) return "ROUTER";
  if (/S(?:5700|6700|6720|6730)/i.test(haystack)) return "SWITCH";
  return "UNKNOWN";
}

export function parseGlobalVlans(configOutput?: string, vlanOutput?: string): {
  globalVlans: Set<number>;
  hasGlobalVlanEvidence: boolean;
} {
  const globalVlans = new Set<number>();
  const text = [configOutput, vlanOutput].filter(Boolean).join("\n");
  if (!text.trim()) return { globalVlans, hasGlobalVlanEvidence: false };

  let inVlanSummary = false;
  for (const line of text.split(/\r?\n/)) {
    const content = line.trim();
    if (/^Static VLAN:/i.test(content) || /^Total\s+\d+\s+static\s+VLAN/i.test(content)) {
      inVlanSummary = true;
      continue;
    }
    if (inVlanSummary && /^-{3,}/.test(content)) {
      inVlanSummary = false;
    }

    const batch = content.match(/^vlan\s+batch\s+(.+)$/i);
    if (batch) {
      addVlanList(globalVlans, batch[1]);
      continue;
    }
    const vlanBlock = content.match(/^vlan\s+(\d{1,4})$/i);
    if (vlanBlock) {
      addVlan(globalVlans, vlanBlock[1]);
      continue;
    }
    // display vlan summary continuation: "1 9 to 10 ... 1704 to 1705 ..."
    if (inVlanSummary && /^\d/.test(content)) {
      addVlanList(globalVlans, content);
      continue;
    }
    // display vlan row: "1705 common  TG:XGE0/0/40(U)"
    const displayVlan = content.match(/^(\d{1,4})\s+(?:common|enable|disable|\S+)/i);
    if (displayVlan && !/^[-\s]*$/.test(content)) {
      addVlan(globalVlans, displayVlan[1]);
    }
  }

  return {
    globalVlans,
    hasGlobalVlanEvidence:
      /\bvlan\s+batch\b|\nvlan\s+\d{1,4}\b|\bVID\b|\bVLAN ID\b|\bStatic VLAN:\b|\bstatic VLAN\b/i.test(`\n${text}`),
  };
}

/** Port membership from operational `display vlan` (TG/UT/MP/ST columns). */
export function parseSwitchingVlansFromDisplayVlan(vlanOutput?: string): Set<number> {
  const vlans = new Set<number>();
  if (!vlanOutput) return vlans;
  for (const line of vlanOutput.split(/\r?\n/)) {
    const content = line.trim();
    const withPorts = content.match(/^(\d{1,4})\s+common\s+(?:TG|UT|MP|ST):/i);
    if (withPorts) addVlan(vlans, withPorts[1]);
  }
  return vlans;
}

export function parseSwitchingVlans(configOutput?: string): Set<number> {
  const vlans = new Set<number>();
  if (!configOutput) return vlans;
  for (const line of configOutput.split(/\r?\n/)) {
    const content = line.trim();
    const trunk = content.match(/^port\s+trunk\s+allow-pass\s+vlan\s+(.+)$/i);
    if (trunk) {
      addVlanList(vlans, trunk[1]);
      continue;
    }
    const def = content.match(/^port\s+default\s+vlan\s+(\d{1,4})$/i);
    if (def) addVlan(vlans, def[1]);
    const hybrid = content.match(/^port\s+hybrid\s+(?:tagged|untagged)\s+vlan\s+(.+)$/i);
    if (hybrid) addVlanList(vlans, hybrid[1]);
  }
  return vlans;
}

export function parseMacVlans(output?: string): Set<number> {
  const vlans = new Set<number>();
  if (!output) return vlans;
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/\b(?:vlan|vid)\s*[:=]?\s*(\d{1,4})\b/i) ?? line.match(/^\s*(\d{1,4})\s+[0-9a-f]{4}/i);
    if (match) addVlan(vlans, match[1]);
  }
  return vlans;
}

export function addPseudowireEvidence(circuit: ParsedL2Circuit, role: L2DeviceRoleFamily): ParsedL2Circuit {
  const type = circuit.circuitType === "vpws" ? "vpws" : "l2vc";
  return {
    ...circuit,
    circuitType: type,
    classification: type,
    l2Transport: "pseudowire",
    deviceRoleFamily: role,
    evidenceFlags: {
      ...circuit.evidenceFlags,
      hasDot1q: circuit.outerVlan !== undefined,
      hasVcId: Boolean(circuit.vcId),
      hasPeer: Boolean(circuit.peerIp),
      hasVlanif: Boolean(circuit.localInterface?.toLowerCase().startsWith("vlanif")),
    },
  };
}

export function addVsiEvidence(circuit: ParsedL2Circuit, role: L2DeviceRoleFamily): ParsedL2Circuit {
  const type = circuit.circuitType === "vpls" ? "vpls" : "vsi";
  return {
    ...circuit,
    circuitType: type,
    classification: type,
    l2Transport: "multipoint",
    deviceRoleFamily: role,
    evidenceFlags: {
      ...circuit.evidenceFlags,
      hasVsi: true,
      hasPeer: Boolean(circuit.peerIp),
    },
  };
}

function addVlanList(target: Set<number>, value: string): void {
  let remaining = value.trim();
  if (!remaining) return;

  // Huawei inclusive ranges: "801 to 803" → 801, 802, 803
  for (const match of remaining.matchAll(/(\d{1,4})\s+to\s+(\d{1,4})/gi)) {
    addRange(target, parseInt(match[1], 10), parseInt(match[2], 10));
  }
  remaining = remaining.replace(/\d{1,4}\s+to\s+\d{1,4}/gi, " ");

  for (const token of remaining.split(/\s+/)) {
    if (!token) continue;
    const hyphen = token.match(/^(\d{1,4})-(\d{1,4})$/);
    if (hyphen) {
      addRange(target, parseInt(hyphen[1], 10), parseInt(hyphen[2], 10));
      continue;
    }
    const id = token.match(/^(\d{1,4})$/);
    if (id) addVlan(target, id[1]);
  }
}

/** Expand Huawei vlan list notation for tests and diagnostics. */
export function expandHuaweiVlanList(value: string): number[] {
  const target = new Set<number>();
  addVlanList(target, value);
  return [...target].sort((a, b) => a - b);
}

/** Prefer lightweight summary; fall back to full `display vlan` when present. */
export function resolveDisplayVlanOutput(rawOutputs: Record<string, string | undefined>): string | undefined {
  const summary = rawOutputs["display vlan summary"]?.trim();
  if (summary) return summary;
  return rawOutputs["display vlan"]?.trim() || undefined;
}

function addRange(target: Set<number>, start: number, end: number): void {
  const low = Math.max(2, Math.min(start, end));
  const high = Math.min(4094, Math.max(start, end));
  for (let id = low; id <= high; id += 1) addVlan(target, id);
}

function addVlan(target: Set<number>, value: number | string): void {
  const vlan = normalizeServiceVlanId(value);
  if (vlan !== null) target.add(vlan);
}

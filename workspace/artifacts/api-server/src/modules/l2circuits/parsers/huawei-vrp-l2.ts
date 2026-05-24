import type { L2DeviceRoleFamily, ParsedL2Circuit } from "../l2circuits.types.js";
import { truncateL2Evidence } from "../redact-l2-output.js";
import {
  addPseudowireEvidence,
  addVsiEvidence,
  inferDeviceRoleFamily,
  parseGlobalVlans,
  parseMacVlans,
  parseSwitchingVlans,
  type ParserContext,
} from "./classification.helpers.js";
import { parseVlanLocalCircuits } from "./dot1q-local.parser.js";
import {
  isS6730L2vcFormat,
  parseS6730MplsL2vc,
  parseS6730VsiVerbose,
} from "./s6730-l2.parser.js";

export function parseHuaweiL2Circuits(rawOutputs: Record<string, string | undefined>): ParsedL2Circuit[] {
  const circuits: ParsedL2Circuit[] = [];
  const deviceRoleFamily = inferDeviceRoleFamily(rawOutputs);

  // Parse MPLS L2VC verbose (NE8000-style)
  if (rawOutputs["display mpls l2vc verbose"]) {
    circuits.push(...parseL2vcVerbose(rawOutputs["display mpls l2vc verbose"], deviceRoleFamily));
  }

  // Parse MPLS L2VC non-verbose (S6730 / switch-style)
  if (rawOutputs["display mpls l2vc"] && isS6730L2vcFormat(rawOutputs["display mpls l2vc"])) {
    circuits.push(...parseS6730MplsL2vc(rawOutputs["display mpls l2vc"], deviceRoleFamily));
  }

  // Parse VSI verbose (NE8000 dot blocks + S6730 ***VSI Name blocks)
  if (rawOutputs["display vsi verbose"]) {
    circuits.push(...parseVsiVerbose(rawOutputs["display vsi verbose"], deviceRoleFamily));
  }

  const { globalVlans, hasGlobalVlanEvidence } = parseGlobalVlans(
    rawOutputs["display current-configuration interface"],
    rawOutputs["display vlan"],
  );
  const context: ParserContext = {
    deviceRoleFamily,
    globalVlans,
    hasGlobalVlanEvidence,
    switchingVlans: parseSwitchingVlans(rawOutputs["display current-configuration interface"]),
    macVlans: parseMacVlans(rawOutputs["display mac-address vlan"]),
    l2vcClientInterfaces: new Set(circuits.filter((c) => c.circuitType === "l2vc" || c.circuitType === "vpws").map((c) => c.localInterface).filter(Boolean) as string[]),
    vsiInterfaces: new Set(circuits.filter((c) => c.circuitType === "vsi" || c.circuitType === "vpls").map((c) => c.localInterface).filter(Boolean) as string[]),
  };

  // Parse dot1q / VLAN_LOCAL from config + interface description
  if (rawOutputs["display current-configuration interface"]) {
    circuits.push(
      ...parseVlanLocalCircuits(
        rawOutputs["display current-configuration interface"],
        rawOutputs["display interface description"],
        context,
      ),
    );
  }

  if (rawOutputs["display vlan"]) {
    circuits.push(...parseDisplayVlanOrphans(rawOutputs["display vlan"], circuits, context));
  }

  return dedupeCircuits(circuits);
}

function dedupeCircuits(circuits: ParsedL2Circuit[]): ParsedL2Circuit[] {
  const seen = new Map<string, ParsedL2Circuit>();

  for (const circuit of circuits) {
    const key =
      (circuit.circuitType === "vlan_local" || circuit.circuitType === "vlan_orphan" || circuit.circuitType === "l3_vrf_link" || circuit.circuitType === "l3_interface") && circuit.localInterface && circuit.outerVlan !== undefined
        ? `${circuit.circuitType}:${circuit.localInterface}:${circuit.outerVlan}`
        : `${circuit.circuitType}:${circuit.name}:${circuit.vcId ?? ""}:${circuit.vsiName ?? ""}`;

    if (!seen.has(key)) {
      seen.set(key, circuit);
    }
  }

  return [...seen.values()];
}

function parseL2vcVerbose(output: string, role: L2DeviceRoleFamily): ParsedL2Circuit[] {
  const circuits: ParsedL2Circuit[] = [];
  const sections = output.split(/^\.+$/m);

  for (const section of sections) {
    if (!section.trim()) continue;

    const lines = section.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const circuit: Partial<ParsedL2Circuit> = {
      circuitType: "l2vc",
      adminStatus: "UNKNOWN",
      operStatus: "UNKNOWN",
      rawEvidence: truncateL2Evidence(section),
    };

    for (const line of lines) {
      if (line.match(/^VC ID\s*:/i)) {
        circuit.vcId = line.split(/:\s*/, 2)[1];
        circuit.name = `L2VC-${circuit.vcId}`;
      } else if (line.match(/^VC Type\s*:/i)) {
        const type = line.split(/:\s*/, 2)[1];
        if (type.toLowerCase().includes("vlan")) {
          circuit.circuitType = "vpws";
        }
      } else if (line.match(/^Interface\(Admin\)\s*:/i)) {
        circuit.localInterface = line.split(/:\s*/, 2)[1];
      } else if (line.match(/^Interface\(Oper\)\s*:/i)) {
        const operStatus = line.split(/:\s*/, 2)[1];
        circuit.operStatus = operStatus;
      } else if (line.match(/^OuterVlan\s*:/i)) {
        const vlan = line.split(/:\s*/, 2)[1];
        circuit.outerVlan = parseInt(vlan, 10);
      } else if (line.match(/^InnerVlan\s*:/i)) {
        const vlan = line.split(/:\s*/, 2)[1];
        circuit.innerVlan = parseInt(vlan, 10);
      } else if (line.match(/^Peer IP\s*:/i)) {
        circuit.peerIp = line.split(/:\s*/, 2)[1];
      } else if (line.match(/^Admin Status\s*:/i)) {
        circuit.adminStatus = line.split(/:\s*/, 2)[1];
      } else if (line.match(/^Oper Status\s*:/i)) {
        circuit.operStatus = line.split(/:\s*/, 2)[1];
      } else if (line.match(/^PW Status\s*:/i)) {
        circuit.pwStatus = line.split(/:\s*/, 2)[1];
      } else if (line.match(/^Description\s*:/i)) {
        circuit.description = line.split(/:\s*/, 2)[1];
      }
    }

    if (circuit.vcId && circuit.peerIp && circuit.localInterface) {
      circuits.push(addPseudowireEvidence({
        circuitType: (circuit.circuitType as "l2vc" | "vpws") || "l2vc",
        name: circuit.name || "unknown-l2vc",
        vcId: circuit.vcId,
        localInterface: circuit.localInterface,
        peerIp: circuit.peerIp,
        outerVlan: circuit.outerVlan,
        innerVlan: circuit.innerVlan,
        adminStatus: circuit.adminStatus as string,
        operStatus: circuit.operStatus as string,
        pwStatus: circuit.pwStatus,
        description: circuit.description,
        rawEvidence: circuit.rawEvidence || "",
      }, role));
    }
  }

  return circuits;
}

function parseVsiVerbose(output: string, role: L2DeviceRoleFamily): ParsedL2Circuit[] {
  if (/\*{2,3}\s*VSI Name\s*:/i.test(output) || /Peer Router ID\s*:/i.test(output)) {
    return parseS6730VsiVerbose(output, role);
  }

  const circuits: ParsedL2Circuit[] = [];
  const sections = output.split(/^\.+$/m);

  for (const section of sections) {
    if (!section.trim()) continue;

    const lines = section.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const circuit: Partial<ParsedL2Circuit> = {
      circuitType: "vsi",
      adminStatus: "UNKNOWN",
      operStatus: "UNKNOWN",
      rawEvidence: truncateL2Evidence(section),
    };

    for (const line of lines) {
      if (line.match(/^VSI Name\s*:/i)) {
        circuit.vsiName = line.split(/:\s*/, 2)[1];
        circuit.name = circuit.vsiName;
      } else if (line.match(/^VSI ID\s*:/i)) {
        circuit.vsiId = line.split(/:\s*/, 2)[1];
      } else if (line.match(/^BD ID\s*:/i)) {
        const bdId = line.split(/:\s*/, 2)[1];
        circuit.outerVlan = parseInt(bdId, 10);
      } else if (line.match(/^MAC Count\s*:/i)) {
        const count = line.split(/:\s*/, 2)[1];
        circuit.macCount = parseInt(count, 10);
      } else if (line.match(/^Bound Interface\s*:/i)) {
        circuit.localInterface = line.split(/:\s*/, 2)[1];
      } else if (line.match(/^Peer IP.*\(local\)\s*:/i)) {
        const peerLocal = line.split(/:\s*/, 2)[1];
        if (peerLocal && peerLocal.toLowerCase() !== "null") {
          circuit.peerIp = peerLocal;
        }
      } else if (line.match(/^Peer IP.*\(remote\)\s*:/i)) {
        const peerRemote = line.split(/:\s*/, 2)[1];
        if (peerRemote && peerRemote.toLowerCase() !== "null") {
          circuit.peerIp = peerRemote;
        }
      } else if (line.match(/^Admin Status\s*:/i)) {
        circuit.adminStatus = line.split(/:\s*/, 2)[1];
      } else if (line.match(/^Oper Status\s*:/i)) {
        circuit.operStatus = line.split(/:\s*/, 2)[1];
      } else if (line.match(/^Description\s*:/i)) {
        circuit.description = line.split(/:\s*/, 2)[1];
      }
    }

    if (circuit.vsiName && (circuit.vsiId || circuit.peerIp || circuit.localInterface)) {
      circuits.push(addVsiEvidence({
        circuitType: "vsi",
        name: circuit.name || circuit.vsiName || "unknown-vsi",
        vsiName: circuit.vsiName,
        vsiId: circuit.vsiId,
        localInterface: circuit.localInterface,
        peerIp: circuit.peerIp,
        outerVlan: circuit.outerVlan,
        macCount: circuit.macCount,
        adminStatus: circuit.adminStatus as string,
        operStatus: circuit.operStatus as string,
        description: circuit.description,
        rawEvidence: circuit.rawEvidence || "",
      }, role));
    }
  }

  return circuits;
}

function parseDisplayVlanOrphans(output: string, existing: ParsedL2Circuit[], context: ParserContext): ParsedL2Circuit[] {
  const usedVlans = new Set(existing.map((c) => c.outerVlan).filter((v): v is number => v !== undefined));
  const circuits: ParsedL2Circuit[] = [];

  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d{1,4})\s+(?:common|enable|disable|\S+)/i);
    if (!match) continue;
    const vlanId = parseInt(match[1], 10);
    if (vlanId <= 0 || vlanId > 4094 || usedVlans.has(vlanId)) continue;
    circuits.push({
      circuitType: "vlan_orphan",
      serviceId: `vlan-${vlanId}:orphan`,
      name: `VLAN-${vlanId}`,
      outerVlan: vlanId,
      adminStatus: "UNKNOWN",
      operStatus: "CONFIG_ONLY",
      rawEvidence: truncateL2Evidence(line.trim()),
      classification: "vlan_orphan",
      l2Transport: "none",
      deviceRoleFamily: context.deviceRoleFamily,
      evidenceFlags: {
        hasDot1q: false,
        hasVcId: false,
        hasPeer: false,
        hasVsi: false,
        hasIp: false,
        hasVrf: false,
        hasVlanif: false,
        hasMac: false,
        hasBridge: false,
        hasSwitchingUse: false,
        vlanDeclaredGlobal: true,
      },
      anomalyTags: [],
      roleContext: context.deviceRoleFamily === "SWITCH" ? "switch_huawei_s" : "unknown",
    });
  }

  return circuits;
}

import type { ParsedL2Circuit } from "../l2circuits.types.js";

export function parseHuaweiL2Circuits(rawOutputs: Record<string, string | undefined>): ParsedL2Circuit[] {
  const circuits: ParsedL2Circuit[] = [];

  // Parse MPLS L2VC verbose
  if (rawOutputs["display mpls l2vc verbose"]) {
    circuits.push(...parseL2vcVerbose(rawOutputs["display mpls l2vc verbose"]));
  }

  // Parse VSI verbose
  if (rawOutputs["display vsi verbose"]) {
    circuits.push(...parseVsiVerbose(rawOutputs["display vsi verbose"]));
  }

  return circuits;
}

function parseL2vcVerbose(output: string): ParsedL2Circuit[] {
  const circuits: ParsedL2Circuit[] = [];
  const sections = output.split(/^\.+$/m);

  for (const section of sections) {
    if (!section.trim()) continue;

    const lines = section.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const circuit: Partial<ParsedL2Circuit> = {
      circuitType: "l2vc",
      adminStatus: "UNKNOWN",
      operStatus: "UNKNOWN",
      rawEvidence: section.slice(0, 240),
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

    if (circuit.vcId || circuit.name) {
      circuits.push({
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
      });
    }
  }

  return circuits;
}

function parseVsiVerbose(output: string): ParsedL2Circuit[] {
  const circuits: ParsedL2Circuit[] = [];
  const sections = output.split(/^\.+$/m);

  for (const section of sections) {
    if (!section.trim()) continue;

    const lines = section.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const circuit: Partial<ParsedL2Circuit> = {
      circuitType: "vsi",
      adminStatus: "UNKNOWN",
      operStatus: "UNKNOWN",
      rawEvidence: section.slice(0, 240),
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

    if (circuit.vsiName) {
      circuits.push({
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
      });
    }
  }

  return circuits;
}

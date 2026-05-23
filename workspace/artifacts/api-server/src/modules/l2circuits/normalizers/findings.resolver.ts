import type { L2Finding, L2FindingCode, NormalizedL2Circuit } from "../l2circuits.types.js";

export function resolveL2Findings(circuits: NormalizedL2Circuit[]): L2Finding[] {
  const findings: L2Finding[] = [];

  // Check for circuit down
  for (const circuit of circuits) {
    if (circuit.adminStatus === "UP" && circuit.operStatus === "DOWN") {
      findings.push({
        code: "CIRCUIT_DOWN",
        severity: "error",
        message: `Circuit ${circuit.name} is administratively up but operationally down`,
      });
    }
  }

  // Check for incomplete L2 config
  for (const circuit of circuits) {
    if (circuit.circuitType === "l2vc" && !circuit.vcId) {
      findings.push({
        code: "INCOMPLETE_L2_CONFIG",
        severity: "warning",
        message: `L2VC ${circuit.name} missing VC ID`,
      });
    }
    if (circuit.circuitType === "vsi" && !circuit.vsiName) {
      findings.push({
        code: "INCOMPLETE_L2_CONFIG",
        severity: "warning",
        message: `VSI ${circuit.name} missing VSI name`,
      });
    }
    if ((circuit.circuitType === "l2vc" || circuit.circuitType === "vpws") && !circuit.peerIp) {
      findings.push({
        code: "INCOMPLETE_L2_CONFIG",
        severity: "warning",
        message: `Circuit ${circuit.name} missing peer IP`,
      });
    }
  }

  // Check for duplicated VC IDs
  const vcIdMap = new Map<string, string[]>();
  for (const circuit of circuits) {
    if (circuit.vcId) {
      if (!vcIdMap.has(circuit.vcId)) {
        vcIdMap.set(circuit.vcId, []);
      }
      vcIdMap.get(circuit.vcId)!.push(circuit.name);
    }
  }

  for (const [vcId, names] of vcIdMap.entries()) {
    if (names.length > 1) {
      findings.push({
        code: "DUPLICATED_VC_ID",
        severity: "error",
        message: `VC ID ${vcId} appears in multiple circuits: ${names.join(", ")}`,
      });
    }
  }

  // Check for VLAN conflicts
  const vlanMap = new Map<string, string[]>();
  for (const circuit of circuits) {
    if (circuit.outerVlan && circuit.innerVlan) {
      const key = `${circuit.outerVlan}.${circuit.innerVlan}`;
      if (!vlanMap.has(key)) {
        vlanMap.set(key, []);
      }
      vlanMap.get(key)!.push(circuit.name);
    }
  }

  for (const [vlanKey, names] of vlanMap.entries()) {
    if (names.length > 1) {
      findings.push({
        code: "VLAN_CONFLICT",
        severity: "warning",
        message: `VLAN pair ${vlanKey} appears in multiple circuits: ${names.join(", ")}`,
      });
    }
  }

  // Check for missing descriptions
  for (const circuit of circuits) {
    if (!circuit.description || circuit.description.toLowerCase() === "null" || circuit.description.trim() === "") {
      findings.push({
        code: "DESCRIPTION_MISSING",
        severity: "info",
        message: `Circuit ${circuit.name} has no description`,
      });
    }
  }

  return findings;
}

export function attachFindingsToCircuits(circuits: NormalizedL2Circuit[], findings: L2Finding[]): NormalizedL2Circuit[] {
  return circuits.map((circuit) => {
    const circuitFindings = findings.filter((f) => f.message.includes(circuit.name));
    return {
      ...circuit,
      findings: circuitFindings,
    };
  });
}

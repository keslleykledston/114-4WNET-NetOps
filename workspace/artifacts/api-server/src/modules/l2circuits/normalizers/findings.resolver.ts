import type { L2Finding, NormalizedL2Circuit } from "../l2circuits.types.js";
import { buildCircuitKey, circuitLabel } from "./circuit-key.helpers.js";

function isPwDown(pwStatus?: string): boolean {
  if (!pwStatus) return false;
  const normalized = pwStatus.toLowerCase().trim();
  return normalized === "down" || normalized.startsWith("down");
}

function isServiceDown(circuit: NormalizedL2Circuit): boolean {
  if (circuit.operStatus === "DOWN") return true;
  if (isPwDown(circuit.pwStatus)) return true;
  const session = circuit.sessionState?.toLowerCase().trim() ?? "";
  return session === "down" || session === "inactive";
}

function addFinding(
  bucket: Map<string, L2Finding[]>,
  circuitKey: string,
  finding: L2Finding,
) {
  const list = bucket.get(circuitKey) ?? [];
  list.push(finding);
  bucket.set(circuitKey, list);
}

function addFindingToMany(
  bucket: Map<string, L2Finding[]>,
  circuitKeys: string[],
  finding: L2Finding,
) {
  for (const key of circuitKeys) {
    addFinding(bucket, key, finding);
  }
}

/** Attach findings per circuit using exact logical keys (no substring matching). */
export function enrichCircuitsWithFindings(
  circuits: NormalizedL2Circuit[],
  deviceId = 0,
): NormalizedL2Circuit[] {
  const keyOf = (circuit: NormalizedL2Circuit) => buildCircuitKey(circuit, deviceId);
  const findingsByKey = new Map<string, L2Finding[]>();

  for (const circuit of circuits) {
  const circuitKey = keyOf(circuit);
  const label = circuitLabel(circuit);

    if (circuit.classification === "vlan_orphan") {
      addFinding(findingsByKey, circuitKey, {
        code: "VLAN_ORPHAN",
        severity: "warning",
        message:
          `Subinterface ${label} possui apenas encapsulamento dot1q e não apresenta evidência de serviço L2/L3 conhecido. ` +
          "Validar se é resíduo de configuração. Se não estiver em uso, remover a subinterface; se estiver em uso, corrigir amarração e descrição do serviço.",
      });
    }
    if (circuit.classification === "vlanif_orphan") {
      addFinding(findingsByKey, circuitKey, {
        code: "VLANIF_ORPHAN",
        severity: "warning",
        message: `Vlanif ${label} has no IP, VRF, L2VC, VSI, MAC, or switching service`,
      });
    }
    if (circuit.classification === "vlan_not_in_switch_batch" || circuit.anomalyTags?.includes("VLAN_NOT_IN_SWITCH_BATCH")) {
      addFinding(findingsByKey, circuitKey, {
        code: "VLAN_NOT_IN_SWITCH_BATCH",
        severity: "warning",
        message: `VLAN ${circuit.outerVlan ?? label} is referenced on ${label} but missing from switch global vlan batch`,
      });
    }
    if (circuit.anomalyTags?.includes("ROUTER_L2_VLAN_ANOMALY")) {
      addFinding(findingsByKey, circuitKey, {
        code: "ROUTER_L2_VLAN_ANOMALY",
        severity: "warning",
        message: `Router device has local VLAN construct on ${label}`,
      });
    }
    if ((circuit.circuitType === "l2vc" || circuit.circuitType === "vpws") && (!circuit.vcId || !circuit.peerIp || !circuit.localInterface)) {
      addFinding(findingsByKey, circuitKey, {
        code: "CLASSIFICATION_CONFLICT",
        severity: "error",
        message: `Circuit ${label} classified as pseudowire without VC ID, peer, and local interface`,
      });
    }
  }

  for (const circuit of circuits) {
    const circuitKey = keyOf(circuit);
    const label = circuitLabel(circuit);
    if (circuit.operStatus === "DOWN") {
      addFinding(findingsByKey, circuitKey, {
        code: "CIRCUIT_DOWN",
        severity: "error",
        message: `Circuit ${label} is operationally down`,
      });
    }
    if ((circuit.circuitType === "l2vc" || circuit.circuitType === "vpws") && isPwDown(circuit.pwStatus)) {
      addFinding(findingsByKey, circuitKey, {
        code: "L2VC_DOWN",
        severity: "error",
        message: `L2VC/VPWS ${label} pseudowire is down`,
      });
    }
    if ((circuit.circuitType === "vsi" || circuit.circuitType === "vpls") && isServiceDown(circuit)) {
      addFinding(findingsByKey, circuitKey, {
        code: "VSI_DOWN",
        severity: "error",
        message: `VSI/VPLS ${label} service is down`,
      });
    }
  }

  const localVlanMap = new Map<number, { keys: string[]; labels: string[] }>();
  for (const circuit of circuits) {
    if (circuit.classification !== "vlan_local" || circuit.outerVlan === undefined) continue;
    const entry = localVlanMap.get(circuit.outerVlan) ?? { keys: [], labels: [] };
    entry.keys.push(keyOf(circuit));
    entry.labels.push(circuit.localInterface ?? circuit.name);
    localVlanMap.set(circuit.outerVlan, entry);
  }

  for (const [vlan, entry] of localVlanMap.entries()) {
    if (entry.labels.length > 1) {
      addFindingToMany(findingsByKey, entry.keys, {
        code: "VLAN_MULTI_INTERFACE_LOCAL",
        severity: "info",
        message: `VLAN ${vlan} has local L2 use on multiple interfaces: ${entry.labels.join(", ")}`,
      });
    }
  }

  for (const circuit of circuits) {
    const circuitKey = keyOf(circuit);
    const label = circuitLabel(circuit);
    if ((circuit.circuitType === "l2vc" || circuit.circuitType === "vpws") && circuit.outerVlan !== undefined) {
      addFinding(findingsByKey, circuitKey, {
        code: "VLAN_USED_IN_L2VC",
        severity: "info",
        message: `VLAN ${circuit.outerVlan} is used in pseudowire ${label}`,
      });
    }
    if ((circuit.circuitType === "vsi" || circuit.circuitType === "vpls") && (circuit.outerVlan !== undefined || circuit.vsiName)) {
      addFinding(findingsByKey, circuitKey, {
        code: "VLAN_USED_IN_VSI",
        severity: "info",
        message: `VSI ${circuit.vsiName ?? label} is used as multipoint L2 service`,
      });
    }
    if ((circuit.classification === "l3_vrf_link" || circuit.classification === "l3_interface") && circuit.outerVlan !== undefined) {
      addFinding(findingsByKey, circuitKey, {
        code: "VLAN_USED_IN_L3_VRF",
        severity: "info",
        message: `VLAN ${circuit.outerVlan} is used by L3 interface ${label}`,
      });
    }
  }

  for (const circuit of circuits) {
    const circuitKey = keyOf(circuit);
    const label = circuitLabel(circuit);
    if (
      (circuit.circuitType === "l2vc" || circuit.circuitType === "vpws") &&
      circuit.remoteForwardingState?.toLowerCase().trim() === "not forwarding"
    ) {
      addFinding(findingsByKey, circuitKey, {
        code: "REMOTE_NOT_FORWARDING",
        severity: "warning",
        message: `Circuit ${label} remote PW is not forwarding`,
      });
    }
  }

  for (const circuit of circuits) {
    const circuitKey = keyOf(circuit);
    const label = circuitLabel(circuit);
    if (circuit.circuitType === "l2vc" && !circuit.vcId) {
      addFinding(findingsByKey, circuitKey, {
        code: "INCOMPLETE_L2_CONFIG",
        severity: "warning",
        message: `L2VC ${label} missing VC ID`,
      });
    }
    if (circuit.circuitType === "vsi" && !circuit.vsiName) {
      addFinding(findingsByKey, circuitKey, {
        code: "INCOMPLETE_L2_CONFIG",
        severity: "warning",
        message: `VSI ${label} missing VSI name`,
      });
    }
    if ((circuit.circuitType === "l2vc" || circuit.circuitType === "vpws") && !circuit.peerIp) {
      addFinding(findingsByKey, circuitKey, {
        code: "INCOMPLETE_L2_CONFIG",
        severity: "warning",
        message: `Circuit ${label} missing peer IP`,
      });
    }
  }

  const vcIdMap = new Map<string, { keys: string[]; labels: string[] }>();
  for (const circuit of circuits) {
    if (!circuit.vcId) continue;
    const entry = vcIdMap.get(circuit.vcId) ?? { keys: [], labels: [] };
    entry.keys.push(keyOf(circuit));
    entry.labels.push(circuitLabel(circuit));
    vcIdMap.set(circuit.vcId, entry);
  }

  for (const [vcId, entry] of vcIdMap.entries()) {
    if (entry.labels.length > 1) {
      addFindingToMany(findingsByKey, entry.keys, {
        code: "DUPLICATED_VC_ID",
        severity: "error",
        message: `VC ID ${vcId} appears in multiple circuits: ${entry.labels.join(", ")}`,
      });
    }
  }

  const vlanMap = new Map<string, { keys: string[]; labels: string[] }>();
  for (const circuit of circuits) {
    if (circuit.outerVlan && circuit.innerVlan) {
      const pairKey = `${circuit.outerVlan}.${circuit.innerVlan}`;
      const entry = vlanMap.get(pairKey) ?? { keys: [], labels: [] };
      entry.keys.push(keyOf(circuit));
      entry.labels.push(circuitLabel(circuit));
      vlanMap.set(pairKey, entry);
    }
  }

  for (const [vlanKey, entry] of vlanMap.entries()) {
    if (entry.labels.length > 1) {
      addFindingToMany(findingsByKey, entry.keys, {
        code: "VLAN_CONFLICT",
        severity: "warning",
        message: `VLAN pair ${vlanKey} appears in multiple circuits: ${entry.labels.join(", ")}`,
      });
    }
  }

  for (const circuit of circuits) {
    const circuitKey = keyOf(circuit);
    const label = circuitLabel(circuit);
    if (["l2vc", "vpws", "vsi", "vpls"].includes(circuit.circuitType)) {
      continue;
    }
    if (!circuit.description || circuit.description.toLowerCase() === "null" || circuit.description.trim() === "") {
      const isL3Subif =
        circuit.classification === "l3_interface" ||
        circuit.classification === "l3_vrf_link" ||
        circuit.circuitType === "l3_interface" ||
        circuit.circuitType === "l3_vrf_link";
      addFinding(findingsByKey, circuitKey, {
        code: "DESCRIPTION_MISSING",
        severity: "info",
        message: isL3Subif
          ? "Subinterface dot1q possui serviço L3 atrelado, mas não possui descrição operacional. Adicionar descrição padronizada indicando cliente, circuito, peer ou finalidade operacional."
          : `Circuit ${label} has no description`,
      });
    }
  }

  return circuits.map((circuit) => ({
    ...circuit,
    findings: findingsByKey.get(keyOf(circuit)) ?? [],
  }));
}

/** Flat list of all findings (deduped) — for job counters / legacy callers. */
export function resolveL2Findings(circuits: NormalizedL2Circuit[], deviceId = 0): L2Finding[] {
  const enriched = enrichCircuitsWithFindings(circuits, deviceId);
  const seen = new Set<string>();
  const flat: L2Finding[] = [];
  for (const circuit of enriched) {
    for (const finding of circuit.findings) {
      const sig = `${finding.code}\0${finding.message}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      flat.push(finding);
    }
  }
  return flat;
}

/** @deprecated Use enrichCircuitsWithFindings — kept for tools importing attachFindingsToCircuits. */
export function attachFindingsToCircuits(
  circuits: NormalizedL2Circuit[],
  _findings: L2Finding[],
  deviceId = 0,
): NormalizedL2Circuit[] {
  return enrichCircuitsWithFindings(circuits, deviceId);
}

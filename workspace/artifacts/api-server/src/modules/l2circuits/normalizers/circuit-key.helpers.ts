import type { NormalizedL2Circuit } from "../l2circuits.types.js";

export type CircuitKeyInput = Pick<
  NormalizedL2Circuit,
  | "circuitType"
  | "localInterface"
  | "outerVlan"
  | "innerVlan"
  | "vcId"
  | "vsiName"
  | "vsiId"
  | "peerIp"
  | "serviceId"
> & {
  deviceId?: number;
};

/** Exact logical key — never use substring/prefix matching for findings attach. */
export function buildCircuitKey(circuit: CircuitKeyInput, deviceId = 0): string {
  const device = circuit.deviceId ?? deviceId;
  const iface = circuit.localInterface ?? "";
  const type = circuit.circuitType;

  if (
    type === "vlan_local" ||
    type === "vlan_orphan" ||
    type === "dot1q_subif" ||
    type === "vlan" ||
    type === "l3_vrf_link" ||
    type === "l3_interface" ||
    type === "config_only"
  ) {
    return `${device}|dot1q|${iface}|${circuit.outerVlan ?? ""}|${circuit.innerVlan ?? ""}`;
  }

  if (type === "l2vc" || type === "vpws") {
    return `${device}|${type}|${iface}|${circuit.vcId ?? ""}|${circuit.peerIp ?? ""}`;
  }

  if (type === "vsi" || type === "vpls") {
    return `${device}|${type}|${circuit.vsiName ?? ""}|${circuit.vsiId ?? ""}|${iface}`;
  }

  return `${device}|${type}|${circuit.serviceId ?? iface}|${circuit.outerVlan ?? ""}`;
}

export function circuitLabel(circuit: Pick<NormalizedL2Circuit, "localInterface" | "name">): string {
  return circuit.localInterface ?? circuit.name;
}

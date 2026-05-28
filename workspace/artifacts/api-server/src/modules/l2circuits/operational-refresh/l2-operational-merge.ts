import type { SnmpCollectedInterface } from "../../netops/snmp/types.js";
import { buildCircuitKey } from "../normalizers/circuit-key.helpers.js";
import {
  normalizeAdminStatus,
  normalizeL2CircuitStatus,
  normalizeOperStatus,
} from "../normalizers/status.normalizer.js";
import type { NormalizedL2Circuit, ParsedL2Circuit } from "../l2circuits.types.js";

export function normalizeInterfaceName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

export function buildInterfaceStatusMap(interfaces: SnmpCollectedInterface[]): Map<string, SnmpCollectedInterface> {
  const map = new Map<string, SnmpCollectedInterface>();
  for (const iface of interfaces) {
    map.set(normalizeInterfaceName(iface.name), iface);
    if (iface.description) {
      map.set(normalizeInterfaceName(iface.description), iface);
    }
    if (iface.alias) {
      map.set(normalizeInterfaceName(iface.alias), iface);
    }
  }
  return map;
}

export function applySnmpInterfaceStatus(
  circuit: NormalizedL2Circuit,
  interfaceMap: Map<string, SnmpCollectedInterface>,
): boolean {
  if (!circuit.localInterface) return false;
  const snmp = interfaceMap.get(normalizeInterfaceName(circuit.localInterface));
  if (!snmp) return false;

  circuit.adminStatus = normalizeAdminStatus(snmp.adminStatus);
  circuit.operStatus = normalizeOperStatus(snmp.operStatus, circuit.adminStatus);
  return true;
}

export function buildLiveOpsByKey(
  parsed: ParsedL2Circuit[],
  deviceId: number,
): Map<string, ParsedL2Circuit> {
  const map = new Map<string, ParsedL2Circuit>();
  for (const circuit of parsed) {
    const key = buildCircuitKey(
      {
        circuitType: circuit.circuitType,
        localInterface: circuit.localInterface,
        outerVlan: circuit.outerVlan,
        innerVlan: circuit.innerVlan,
        vcId: circuit.vcId,
        vsiName: circuit.vsiName,
        vsiId: circuit.vsiId,
        peerIp: circuit.peerIp,
        serviceId: circuit.serviceId,
      },
      deviceId,
    );
    map.set(key, circuit);
  }
  return map;
}

export function applyLiveOpsToCircuit(
  circuit: NormalizedL2Circuit,
  liveByKey: Map<string, ParsedL2Circuit>,
  deviceId: number,
): boolean {
  const key = buildCircuitKey(circuit, deviceId);
  const live = liveByKey.get(key);
  if (!live) return false;

  if (live.adminStatus) {
    circuit.adminStatus = normalizeAdminStatus(live.adminStatus);
  }
  if (live.operStatus) {
    circuit.operStatus = normalizeOperStatus(live.operStatus, circuit.adminStatus);
  }
  if (live.pwStatus) {
    const status = normalizeL2CircuitStatus(live);
    circuit.pwStatus = status.pwStatus ?? live.pwStatus;
    if (!live.operStatus && status.pwStatus === "DOWN") {
      circuit.operStatus = "DOWN";
    } else if (!live.operStatus && status.pwStatus === "UP" && circuit.operStatus === "CONFIG_ONLY") {
      circuit.operStatus = "UP";
    }
  }
  if (live.remoteForwardingState) {
    circuit.remoteForwardingState = live.remoteForwardingState;
  }
  if (live.sessionState) {
    circuit.sessionState = live.sessionState;
  }
  if (live.description?.trim()) {
    circuit.description = live.description;
  }
  return true;
}

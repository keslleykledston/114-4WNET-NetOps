import type { SnmpCollectedInterface } from "../../netops/snmp/types.js";
import { buildCircuitKey } from "../normalizers/circuit-key.helpers.js";
import {
  normalizeAdminStatus,
  normalizeL2CircuitStatus,
  normalizeOperStatus,
} from "../normalizers/status.normalizer.js";
import type { NormalizedL2Circuit, ParsedL2Circuit } from "../l2circuits.types.js";
import { applyVsiMultipointToParsed } from "../parsers/vsi-multipoint.helpers.js";

/** Normalize Huawei-style names so GE/GigabitEthernet and Eth-/Ethernet- align. */
export function normalizeInterfaceName(name: string): string {
  let normalized = name.trim().toLowerCase().replace(/\s+/g, "");
  normalized = normalized.replace(/^gigabitethernet/, "ge");
  normalized = normalized.replace(/^ethernet/, "eth");
  normalized = normalized.replace(/^ten-gigabitethernet/, "xge");
  return normalized;
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

  if (live.peers?.length) {
    circuit.peers = live.peers;
    circuit.vsiState = live.vsiState ?? circuit.vsiState;
    circuit.pwSummary = live.pwSummary;
    circuit.peerIps = live.peerIps;
    circuit.primaryPeerIp = live.primaryPeerIp;
    circuit.peerIp = live.primaryPeerIp ?? live.peerIp ?? circuit.peerIp;
    const applied = applyVsiMultipointToParsed(circuit);
    circuit.adminStatus = normalizeAdminStatus(applied.vsiState ?? applied.adminStatus);
    circuit.operStatus = applied.operStatus as NormalizedL2Circuit["operStatus"];
    circuit.pwStatus = applied.pwStatus;
    if (live.description?.trim()) {
      circuit.description = live.description;
    }
    return true;
  }

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

export const OPERATIONAL_STALE_TAG = "OPERATIONAL_STALE";

const LIVE_TRACKED_CIRCUIT_TYPES = new Set(["l2vc", "vpws", "vsi", "vpls"]);

export interface OperationalStaleCheckInput {
  snmpCollected: boolean;
  sshOpsCollected: boolean;
  snmpMatched: boolean;
  liveMatched: boolean;
  localInterface?: string | null;
  circuitType: string;
  circuitKey: string;
  liveKeys: Set<string>;
}

/** Mark DB rows that no longer appear on the device during operational refresh. */
export function shouldMarkOperationalStale(input: OperationalStaleCheckInput): boolean {
  const iface = input.localInterface?.trim();
  if (input.snmpCollected && iface) {
    if (!input.snmpMatched) {
      return true;
    }
  }

  if (
    input.sshOpsCollected &&
    input.liveKeys.size > 0 &&
    LIVE_TRACKED_CIRCUIT_TYPES.has(input.circuitType) &&
    !input.liveMatched
  ) {
    return true;
  }

  return false;
}

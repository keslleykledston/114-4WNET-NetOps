import type { L2Circuit, L2FindingCode, L2Status } from "./l2-circuits-api";
import { circuitTypeGroup, circuitTypeLabel } from "./l2-circuit-badges";

export const FILTER_ALL = "all";

export interface L2CircuitFilters {
  device: string;
  circuitType: string;
  status: string;
  vlan: string;
  vcId: string;
  peerIp: string;
}

export const DEFAULT_L2_FILTERS: L2CircuitFilters = {
  device: FILTER_ALL,
  circuitType: FILTER_ALL,
  status: FILTER_ALL,
  vlan: "",
  vcId: "",
  peerIp: "",
};

const STATUS_SORT: Record<L2Status, number> = {
  DOWN: 0,
  PARTIAL: 1,
  CONFIG_ONLY: 2,
  UP: 3,
  UNKNOWN: 4,
};

export function formatVlan(circuit: L2Circuit): string {
  if (circuit.outerVlan == null && circuit.innerVlan == null) return "";
  if (circuit.innerVlan != null) return `${circuit.outerVlan ?? ""}.${circuit.innerVlan}`;
  return String(circuit.outerVlan ?? "");
}

export function circuitKeyField(circuit: L2Circuit) {
  const group = circuitTypeGroup(circuit.circuitType);
  if (group === "local") return formatVlan(circuit) || "—";
  if (group === "mpls") return circuit.vcId ?? "—";
  return circuit.vsiName ?? circuit.vsiId ?? "—";
}

export function matchesFilters(circuit: L2Circuit, filters: Omit<L2CircuitFilters, "device">) {
  if (filters.circuitType !== FILTER_ALL && circuit.circuitType !== filters.circuitType) return false;
  if (filters.status !== FILTER_ALL && circuit.operStatus !== filters.status) return false;

  if (filters.vlan.trim()) {
    const needle = filters.vlan.trim();
    const outer = circuit.outerVlan != null ? String(circuit.outerVlan) : "";
    const inner = circuit.innerVlan != null ? String(circuit.innerVlan) : "";
    if (!outer.includes(needle) && !inner.includes(needle)) return false;
  }

  if (filters.vcId.trim()) {
    const vc = circuit.vcId ?? "";
    if (!vc.includes(filters.vcId.trim())) return false;
  }

  if (filters.peerIp.trim()) {
    const peer = circuit.peerIp ?? "";
    if (!peer.includes(filters.peerIp.trim())) return false;
  }

  return true;
}

export function sortCircuitsForNoc(circuits: L2Circuit[]): L2Circuit[] {
  return [...circuits].sort((left, right) => {
    const statusDelta = STATUS_SORT[left.operStatus] - STATUS_SORT[right.operStatus];
    if (statusDelta !== 0) return statusDelta;

    const findingsDelta = right.findings.length - left.findings.length;
    if (findingsDelta !== 0) return findingsDelta;

    return left.name.localeCompare(right.name, "pt", { sensitivity: "base" });
  });
}

export function hasFinding(circuit: L2Circuit, code: L2FindingCode) {
  return circuit.findings.some((finding) => finding.code === code);
}

export function nocRowClass(circuit: L2Circuit): string {
  if (hasFinding(circuit, "CIRCUIT_DOWN")) {
    return "border-l-2 border-l-red-500 bg-red-500/[0.07] hover:bg-red-500/10";
  }
  if (hasFinding(circuit, "REMOTE_NOT_FORWARDING")) {
    return "border-l-2 border-l-amber-500 bg-amber-500/[0.07] hover:bg-amber-500/10";
  }
  if (circuit.operStatus === "DOWN") {
    return "bg-red-500/[0.04] hover:bg-red-500/[0.08]";
  }
  return "hover:bg-muted/50";
}

export function formatTs(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function circuitExportRow(
  circuit: L2Circuit,
  deviceNameById: Map<number, string>,
) {
  return {
    device: deviceNameById.get(circuit.deviceId) ?? String(circuit.deviceId),
    type: circuitTypeLabel(circuit.circuitType),
    status: circuit.operStatus,
    vlan: formatVlan(circuit),
    vc_id: circuit.vcId ?? "",
    vsi_name: circuit.vsiName ?? "",
    local_interface: circuit.localInterface ?? "",
    peer_ip: circuit.peerIp ?? "",
    findings_count: String(circuit.findings.length),
    last_seen: formatTs(circuit.lastSeen),
  };
}

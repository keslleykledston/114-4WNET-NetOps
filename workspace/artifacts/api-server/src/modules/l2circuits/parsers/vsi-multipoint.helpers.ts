import type { L2PwSummary, L2Status, L2VsiPeer, ParsedL2Circuit } from "../l2circuits.types.js";

export function normalizeCliState(value?: string): L2Status {
  if (!value) return "UNKNOWN";
  const n = value.toLowerCase().trim().replace(/^\*+/, "");
  if (n === "up" || n === "active") return "UP";
  if (n === "down" || n === "inactive") return "DOWN";
  if (n === "partial") return "PARTIAL";
  return "UNKNOWN";
}

export function peerCounts(peers: L2VsiPeer[]): L2PwSummary {
  let up = 0;
  let down = 0;
  let unknown = 0;

  for (const peer of peers) {
    const session = normalizeCliState(peer.session_state);
    const pw = normalizeCliState(peer.pw_state);
    const isDown = session === "DOWN" || pw === "DOWN";
    const isUp = !isDown && (session === "UP" || pw === "UP");

    if (isDown) down += 1;
    else if (isUp) up += 1;
    else unknown += 1;
  }

  return { total: peers.length, up, down, unknown };
}

export interface DerivedVsiMultipointStatus {
  operStatus: L2Status;
  pwStatus: L2Status;
  pwSummary: L2PwSummary;
  primaryPeerIp?: string;
  peerIps: string[];
}

/** Operational rules for Huawei VSI/VPLS multipoint (several peers per VSI). */
export function deriveVsiMultipointStatus(
  vsiStateRaw: string | undefined,
  peers: L2VsiPeer[],
): DerivedVsiMultipointStatus {
  const vsiState = normalizeCliState(vsiStateRaw);
  const pwSummary = peerCounts(peers);
  const peerIps = peers.map((p) => p.peer_ip).filter(Boolean);
  const primaryPeerIp =
    peers.find((p) => p.primary)?.peer_ip ??
    peers.find((p) => normalizeCliState(p.session_state) === "UP" || normalizeCliState(p.pw_state) === "UP")?.peer_ip ??
    peers[0]?.peer_ip;

  let operStatus: L2Status = "UNKNOWN";
  let pwStatus: L2Status = "UNKNOWN";

  if (vsiState === "DOWN") {
    operStatus = "DOWN";
    pwStatus = "DOWN";
  } else if (pwSummary.total === 0) {
    operStatus = "UNKNOWN";
    pwStatus = "UNKNOWN";
  } else if (pwSummary.up === 0) {
    operStatus = "DOWN";
    pwStatus = "DOWN";
  } else if (pwSummary.down > 0) {
    operStatus = "PARTIAL";
    pwStatus = "PARTIAL";
  } else {
    operStatus = "UP";
    pwStatus = "UP";
  }

  return { operStatus, pwStatus, pwSummary, primaryPeerIp, peerIps };
}

export function hasMultipointVsiPeers(circuit: Pick<ParsedL2Circuit, "circuitType" | "peers">): boolean {
  return (circuit.circuitType === "vsi" || circuit.circuitType === "vpls") && (circuit.peers?.length ?? 0) > 0;
}

export function applyVsiMultipointToParsed(circuit: ParsedL2Circuit): ParsedL2Circuit {
  if (!hasMultipointVsiPeers(circuit)) return circuit;

  const derived = deriveVsiMultipointStatus(circuit.vsiState ?? circuit.adminStatus, circuit.peers ?? []);

  return {
    ...circuit,
    operStatus: derived.operStatus,
    pwStatus: derived.pwStatus,
    pwSummary: derived.pwSummary,
    primaryPeerIp: derived.primaryPeerIp,
    peerIps: derived.peerIps,
    peerIp: derived.primaryPeerIp ?? circuit.peerIp,
  };
}

export function mergeVsiOperationalEvidence(
  evidenceFlags: ParsedL2Circuit["evidenceFlags"],
  circuit: Pick<
    ParsedL2Circuit,
    "peers" | "pwSummary" | "vsiState" | "primaryPeerIp" | "peerIps"
  >,
): NonNullable<ParsedL2Circuit["evidenceFlags"]> {
  const base = { ...(evidenceFlags ?? {}) };
  if (!circuit.peers?.length) return base;

  return {
    ...base,
    vsiPeers: circuit.peers,
    pwSummary: circuit.pwSummary,
    vsiState: circuit.vsiState,
    peerIps: circuit.peerIps,
    primaryPeerIp: circuit.primaryPeerIp,
  };
}

export function readVsiOperationalFromEvidence(evidenceFlags: unknown): {
  peers?: L2VsiPeer[];
  pwSummary?: L2PwSummary;
  vsiState?: string;
  primaryPeerIp?: string;
  peerIps?: string[];
} {
  if (!evidenceFlags || typeof evidenceFlags !== "object") return {};
  const flags = evidenceFlags as Record<string, unknown>;
  return {
    peers: Array.isArray(flags.vsiPeers) ? (flags.vsiPeers as L2VsiPeer[]) : undefined,
    pwSummary: flags.pwSummary as L2PwSummary | undefined,
    vsiState: typeof flags.vsiState === "string" ? flags.vsiState : undefined,
    primaryPeerIp: typeof flags.primaryPeerIp === "string" ? flags.primaryPeerIp : undefined,
    peerIps: Array.isArray(flags.peerIps) ? (flags.peerIps as string[]) : undefined,
  };
}

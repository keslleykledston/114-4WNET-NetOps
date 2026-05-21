import { classifyBgpAddressFamily } from "./bgp-af-classifier.js";
import { classifyBgpPeer } from "./bgp-role-classifier.js";
import type { NetopsBgpPeer, NetopsSource } from "../types.js";

export interface RawBgpPeerLike {
  peerIp: string;
  remoteAs?: number | null;
  localAs?: number | null;
  description?: string | null;
  name?: string | null;
  state?: string | null;
  role?: NetopsBgpPeer["role"] | null;
  vrf?: string | null;
  importPolicy?: string | null;
  exportPolicy?: string | null;
  receivedPrefixes?: number | null;
  advertisedPrefixes?: number | null;
  activePrefixes?: number | null;
  uptime?: string | null;
  source: NetopsSource;
}

export function normalizeBgpState(value: string | null | undefined): NetopsBgpPeer["state"] {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "established") return "Established";
  if (normalized === "idle") return "Idle";
  if (normalized === "active") return "Active";
  if (normalized === "connect") return "Connect";
  return "Unknown";
}

export function normalizeBgpPeer(input: RawBgpPeerLike): NetopsBgpPeer {
  const sessionType = input.localAs != null && input.remoteAs != null && input.localAs === input.remoteAs
    ? "iBGP"
    : input.remoteAs != null
      ? "eBGP"
      : "unknown";
  const classifiedRole = sessionType === "iBGP" ? "ibgp" : classifyBgpPeer({
    remoteAs: input.remoteAs ?? null,
    localAs: input.localAs ?? null,
    description: input.description ?? input.name ?? null,
    peerIp: input.peerIp,
    importPolicy: input.importPolicy ?? null,
    exportPolicy: input.exportPolicy ?? null,
  });
  const role = input.role ?? classifiedRole;

  return {
    peerIp: input.peerIp,
    remoteAs: input.remoteAs ?? null,
    description: input.description ?? null,
    name: input.name ?? null,
    state: normalizeBgpState(input.state),
    role,
    roleSource: input.role ? "snapshot" : role === "unknown" ? "unknown" : "classifier",
    addressFamily: classifyBgpAddressFamily(input.peerIp),
    sessionType,
    vrf: input.vrf ?? null,
    importPolicy: input.importPolicy ?? null,
    exportPolicy: input.exportPolicy ?? null,
    receivedPrefixes: input.receivedPrefixes ?? null,
    advertisedPrefixes: input.advertisedPrefixes ?? null,
    activePrefixes: input.activePrefixes ?? null,
    uptime: input.uptime ?? null,
    source: input.source,
  };
}

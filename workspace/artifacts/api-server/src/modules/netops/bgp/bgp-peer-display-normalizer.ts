/**
 * Canonical BGP peer dedupe for UI display.
 * Keep workspace/artifacts/netops-manager/src/features/bgp/bgp-peer-list-utils.ts in sync.
 */

export type BgpPeerMergeLike = {
  peerIp: string;
  vrf?: string | null;
  addressFamily?: string | null;
  remoteAs?: number | null;
  role?: string | null;
  roleSource?: string | null;
  name?: string | null;
  description?: string | null;
  state?: string | null;
  sessionType?: string | null;
  importPolicy?: string | null;
  exportPolicy?: string | null;
  receivedPrefixes?: number | null;
  advertisedPrefixes?: number | null;
  activePrefixes?: number | null;
  uptime?: string | null;
  source?: string | null;
};

const GLOBAL_VRF_ALIASES = new Set(["", "GLOBAL", "DEFAULT", "_PUBLIC_"]);

export function normalizePeerIp(peerIp: string): string {
  return peerIp.trim().toUpperCase();
}

export function normalizeAddressFamily(addressFamily: string | null | undefined): string {
  const normalized = (addressFamily ?? "ipv4").trim().toLowerCase();
  return normalized === "ipv6" ? "ipv6" : "ipv4";
}

export function normalizeVrfForKey(vrf: string | null | undefined): string {
  const normalized = (vrf ?? "").trim().toUpperCase();
  if (GLOBAL_VRF_ALIASES.has(normalized)) return "";
  return normalized;
}

export function bgpPeerStorageKey(peer: Pick<BgpPeerMergeLike, "peerIp" | "addressFamily" | "vrf">): string {
  return `${normalizePeerIp(peer.peerIp)}|${normalizeAddressFamily(peer.addressFamily)}|${normalizeVrfForKey(peer.vrf)}`;
}

function sourceRank(source: string | null | undefined): number {
  switch (source) {
    case "ssh":
    case "ssh_live":
    case "ssh_running_config":
      return 4;
    case "snapshot":
    case "discovery":
      return 3;
    case "snmp":
    case "snmp_snapshot":
      return 2;
    case "db":
    case "local_db":
      return 1;
    default:
      return 0;
  }
}

function pickRicherString(
  left: string | null | undefined,
  right: string | null | undefined,
  leftSource?: string | null,
  rightSource?: string | null,
): string | null {
  if (!left?.trim() && !right?.trim()) return null;
  if (!left?.trim()) return right!.trim();
  if (!right?.trim()) return left.trim();

  const leftRank = sourceRank(leftSource);
  const rightRank = sourceRank(rightSource);
  if (leftRank !== rightRank) {
    return leftRank > rightRank ? left.trim() : right.trim();
  }

  return left.trim().length >= right.trim().length ? left.trim() : right.trim();
}

function pickState(left: string | null | undefined, right: string | null | undefined): string | null {
  const leftKnown = left && left !== "Unknown" ? left : null;
  const rightKnown = right && right !== "Unknown" ? right : null;
  return leftKnown ?? rightKnown ?? left ?? right ?? null;
}

export function mergeBgpPeerFields<T extends BgpPeerMergeLike>(current: T, incoming: T): T {
  const preferredVrf = current.vrf?.trim()
    ? current.vrf
    : incoming.vrf?.trim()
      ? incoming.vrf
      : current.vrf ?? incoming.vrf ?? null;

  return {
    ...current,
    ...incoming,
    remoteAs: current.remoteAs ?? incoming.remoteAs,
    role: current.role ?? incoming.role,
    roleSource: current.roleSource ?? incoming.roleSource,
    name: pickRicherString(current.name, incoming.name, current.source, incoming.source),
    description: pickRicherString(current.description, incoming.description, current.source, incoming.source),
    state: pickState(current.state, incoming.state),
    sessionType: current.sessionType ?? incoming.sessionType,
    importPolicy: current.importPolicy ?? incoming.importPolicy,
    exportPolicy: current.exportPolicy ?? incoming.exportPolicy,
    receivedPrefixes: current.receivedPrefixes ?? incoming.receivedPrefixes,
    advertisedPrefixes: current.advertisedPrefixes ?? incoming.advertisedPrefixes,
    activePrefixes: current.activePrefixes ?? incoming.activePrefixes,
    uptime: current.uptime ?? incoming.uptime,
    vrf: preferredVrf,
    source: sourceRank(current.source) >= sourceRank(incoming.source) ? current.source : incoming.source,
  };
}

function collapseVrfAmbiguousDuplicates<T extends BgpPeerMergeLike>(peers: T[]): T[] {
  const groups = new Map<string, T[]>();

  for (const peer of peers) {
    const groupKey = `${normalizePeerIp(peer.peerIp)}|${normalizeAddressFamily(peer.addressFamily)}|${peer.remoteAs ?? ""}`;
    const list = groups.get(groupKey) ?? [];
    list.push(peer);
    groups.set(groupKey, list);
  }

  const result: T[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    const vrfKeys = new Set(group.map((peer) => normalizeVrfForKey(peer.vrf)));
    const hasGlobalVrf = vrfKeys.has("");
    const hasNamedVrf = [...vrfKeys].some((value) => value !== "");

    if (hasGlobalVrf && hasNamedVrf) {
      let merged = group[0];
      for (let index = 1; index < group.length; index += 1) {
        merged = mergeBgpPeerFields(merged, group[index]);
      }
      const namedVrfPeer = group.find((peer) => normalizeVrfForKey(peer.vrf) !== "");
      result.push({
        ...merged,
        vrf: namedVrfPeer?.vrf ?? merged.vrf ?? null,
      });
      continue;
    }

    result.push(...group);
  }

  return result;
}

export function dedupeBgpPeersForDisplay<T extends BgpPeerMergeLike>(peers: T[]): T[] {
  const byKey = new Map<string, T>();

  for (const peer of peers) {
    const key = bgpPeerStorageKey(peer);
    const current = byKey.get(key);
    byKey.set(key, current ? mergeBgpPeerFields(current, peer) : { ...peer });
  }

  const collapsed = collapseVrfAmbiguousDuplicates([...byKey.values()]);

  return collapsed.sort((left, right) => {
    const peerOrder = normalizePeerIp(left.peerIp).localeCompare(normalizePeerIp(right.peerIp));
    if (peerOrder !== 0) return peerOrder;
    const afOrder = normalizeAddressFamily(left.addressFamily).localeCompare(normalizeAddressFamily(right.addressFamily));
    if (afOrder !== 0) return afOrder;
    return normalizeVrfForKey(left.vrf).localeCompare(normalizeVrfForKey(right.vrf));
  });
}

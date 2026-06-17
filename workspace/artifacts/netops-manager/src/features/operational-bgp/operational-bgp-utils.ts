import type { OperationalBgpPeer } from "./operational-bgp-api";

function normalizePeerIp(peerIp: string): string {
  return peerIp.trim().toUpperCase();
}

function operationalBgpPeerKey(peer: Pick<OperationalBgpPeer, "peerIp" | "vrf">): string {
  return `${normalizePeerIp(peer.peerIp)}|${(peer.vrf ?? "").trim().toUpperCase()}`;
}

export type OperationalBgpPeerView = OperationalBgpPeer & {
  families: string[];
  duplicateCount: number;
};

export function dedupeOperationalBgpPeers(peers: OperationalBgpPeer[]): OperationalBgpPeerView[] {
  const byKey = new Map<string, OperationalBgpPeerView>();

  for (const peer of peers) {
    const key = operationalBgpPeerKey(peer);
    const family = `${peer.afi}/${peer.safi}`;
    const current = byKey.get(key);

    if (!current) {
      byKey.set(key, {
        ...peer,
        families: [family],
        duplicateCount: 1,
      });
      continue;
    }

    const families = current.families.includes(family) ? current.families : [...current.families, family];
    byKey.set(key, {
      ...current,
      families,
      duplicateCount: current.duplicateCount + 1,
      peerAs: current.peerAs ?? peer.peerAs,
      peerType: current.peerType || peer.peerType,
      adminStatus: current.adminStatus || peer.adminStatus,
      operStatus: current.operStatus || peer.operStatus,
      fsmState: current.fsmState || peer.fsmState,
      uptimeSeconds: current.uptimeSeconds ?? peer.uptimeSeconds,
      receivedPrefixes: current.receivedPrefixes ?? peer.receivedPrefixes,
      acceptedPrefixes: current.acceptedPrefixes ?? peer.acceptedPrefixes,
      advertisedPrefixes: current.advertisedPrefixes ?? peer.advertisedPrefixes,
      lastChange: current.lastChange ?? peer.lastChange,
      collectedAt: current.collectedAt || peer.collectedAt,
    });
  }

  return [...byKey.values()].sort((left, right) => {
    const peerOrder = normalizePeerIp(left.peerIp).localeCompare(normalizePeerIp(right.peerIp));
    if (peerOrder !== 0) return peerOrder;
    return (left.vrf ?? "").localeCompare(right.vrf ?? "");
  });
}


import { normalizeBgpPeer } from "../../bgp/bgp-normalizer.js";
import type { NetopsBgpPeer } from "../../types.js";

function numberValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseHuaweiBgpPeers(output: string, addressFamilyHint?: "ipv4" | "ipv6"): NetopsBgpPeer[] {
  const peers: NetopsBgpPeer[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed.match(/^([0-9a-fA-F:.]+)\s+\d+\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+([0-9A-Za-z:]+)\s+([A-Za-z]+|-)/);
    if (!match) continue;

    const [, peerIp, remoteAs, uptime, state] = match;
    peers.push(normalizeBgpPeer({
      peerIp,
      remoteAs: numberValue(remoteAs),
      state,
      uptime,
      source: "ssh",
    }));
  }

  if (addressFamilyHint) {
    return peers.map((peer) => ({ ...peer, addressFamily: addressFamilyHint }));
  }

  return peers;
}

import { normalizeBgpPeer } from "../../bgp/bgp-normalizer.js";
import type { NetopsBgpPeer } from "../../types.js";

function numberValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBgpState(value: string): NetopsBgpPeer["state"] {
  const normalized = value.trim().toLowerCase();
  if (/^established$/.test(normalized)) return "Established";
  if (/^idle/.test(normalized)) return "Idle";
  if (/^active/.test(normalized)) return "Active";
  if (/^connect/.test(normalized)) return "Connect";
  return "Unknown";
}

function parseStateAndPrefixes(value: string): { state: NetopsBgpPeer["state"]; prefixes: number | null } {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return { state: "Established", prefixes: numberValue(trimmed) };
  }
  return { state: normalizeBgpState(trimmed), prefixes: null };
}

export function parseRaisecomBgpPeers(output: string): NetopsBgpPeer[] {
  const peers: NetopsBgpPeer[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(
      /^([0-9a-fA-F:.]+)\s+\d+\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+([0-9A-Za-z:]+)\s+([0-9A-Za-z()\/-]+)$/i,
    );
    if (!match) continue;

    const [, peerIp, remoteAs, uptime, stateOrPrefixes] = match;
    const parsedState = parseStateAndPrefixes(stateOrPrefixes);
    peers.push(normalizeBgpPeer({
      peerIp,
      remoteAs: numberValue(remoteAs),
      state: parsedState.state,
      uptime,
      receivedPrefixes: parsedState.prefixes,
      source: "ssh",
    }));
  }

  return peers;
}

import { normalizeBgpPeer } from "../../bgp/bgp-normalizer.js";
import type { NetopsBgpPeer } from "../../types.js";

function numberValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Regex for extracting peer info from compact peer list
const peerListLineRegex = /^([0-9a-fA-F:.]+)\s+\d+\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+([0-9A-Za-z:]+)\s+([A-Za-z]+|-)/;

// Regex for extracting verbose peer info - in sections like "BGP Peer is 189.23.156.121"
const peerHeaderRegex = /^BGP Peer is ([0-9a-fA-F:.]+),\s*remote AS (\d+)/i;
const peerDescriptionRegex = /^Peer's description:\s*"([^"]+)"/i;
const receivedTotalRoutesRegex = /^Received total routes:\s*(\d+)\s*$/i;
const receivedActiveRoutesRegex = /^Received active routes total:\s*(\d+)\s*$/i;
const advertisedTotalRoutesRegex = /^Advertised total routes:\s*(\d+)\s*$/i;
const stateRegex = /^BGP current state:\s*([A-Za-z]+)/i;
const uptimeRegex = /^BGP current state:[^,]*,\s*Up for\s+([0-9A-Za-z:d]+)/i;

interface ParsedVerbosePeer extends Partial<NetopsBgpPeer> {
  peerIp: string;
}

function parseVerbosePeerBlock(lines: string[]): ParsedVerbosePeer | null {
  let peerIp: string | null = null;
  let remoteAs: number | null = null;
  const result: ParsedVerbosePeer = { peerIp: "", source: "ssh" };

  for (const line of lines) {
    const trimmed = line.trim();

    // Extract peer IP and remote AS
    let headerMatch = peerHeaderRegex.exec(trimmed);
    if (headerMatch) {
      peerIp = headerMatch[1];
      remoteAs = numberValue(headerMatch[2]);
      result.peerIp = peerIp;
      result.remoteAs = remoteAs;
      continue;
    }

    // Extract description
    let descMatch = peerDescriptionRegex.exec(trimmed);
    if (descMatch) {
      result.description = descMatch[1];
      result.name = descMatch[1];
      continue;
    }

    // Extract route counters
    let receivedMatch = receivedTotalRoutesRegex.exec(trimmed);
    if (receivedMatch) {
      result.receivedPrefixes = numberValue(receivedMatch[1]);
      continue;
    }

    let activeMatch = receivedActiveRoutesRegex.exec(trimmed);
    if (activeMatch) {
      result.activePrefixes = numberValue(activeMatch[1]);
      continue;
    }

    let advertisedMatch = advertisedTotalRoutesRegex.exec(trimmed);
    if (advertisedMatch) {
      result.advertisedPrefixes = numberValue(advertisedMatch[1]);
      continue;
    }

    // Extract uptime BEFORE state (uptimeRegex is more specific and includes state info)
    let uptimeMatch = uptimeRegex.exec(trimmed);
    if (uptimeMatch) {
      result.uptime = uptimeMatch[1];
      // Also extract state from this line
      let stateMatch = stateRegex.exec(trimmed);
      if (stateMatch) {
        const stateStr = stateMatch[1].toLowerCase();
        const stateMap: Record<string, "Established" | "Idle" | "Active" | "Connect"> = {
          "established": "Established",
          "idle": "Idle",
          "active": "Active",
          "connect": "Connect",
        };
        result.state = stateMap[stateStr];
      }
      continue;
    }

    // Extract state (when uptime is not available)
    let stateMatch = stateRegex.exec(trimmed);
    if (stateMatch) {
      const stateStr = stateMatch[1].toLowerCase();
      const stateMap: Record<string, "Established" | "Idle" | "Active" | "Connect"> = {
        "established": "Established",
        "idle": "Idle",
        "active": "Active",
        "connect": "Connect",
      };
      result.state = stateMap[stateStr];
      continue;
    }
  }

  // Only return if we found a peer IP
  if (!peerIp) return null;
  return result;
}

export function parseHuaweiBgpPeers(output: string, addressFamilyHint?: "ipv4" | "ipv6"): NetopsBgpPeer[] {
  const peers: NetopsBgpPeer[] = [];
  const peersByIp = new Map<string, ParsedVerbosePeer>();

  const lines = output.split(/\r?\n/);

  // First pass: try to parse verbose blocks
  let currentBlockLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (peerHeaderRegex.test(trimmed)) {
      if (currentBlockLines.length > 0) {
        const parsed = parseVerbosePeerBlock(currentBlockLines);
        if (parsed && parsed.peerIp) {
          peersByIp.set(parsed.peerIp, parsed);
        }
      }
      currentBlockLines = [line];
    } else if (currentBlockLines.length > 0) {
      currentBlockLines.push(line);
    }
  }
  // Don't forget the last block
  if (currentBlockLines.length > 0) {
    const parsed = parseVerbosePeerBlock(currentBlockLines);
    if (parsed && parsed.peerIp) {
      peersByIp.set(parsed.peerIp, parsed);
    }
  }

  // Second pass: parse compact peer list format
  for (const line of lines) {
    const trimmed = line.trim();
    const match = peerListLineRegex.exec(trimmed);
    if (!match) continue;

    const [, peerIp, remoteAs, uptime, stateStr] = match;

    // Normalize state from compact list format
    const validStates: Record<string, "Established" | "Idle" | "Active" | "Connect" | undefined> = {
      "Established": "Established",
      "Idle": "Idle",
      "Active": "Active",
      "Connect": "Connect",
      "-": undefined,
    };

    // If we have verbose data for this peer, merge it
    const verboseData = peersByIp.get(peerIp);
    const peer: Partial<NetopsBgpPeer> = {
      peerIp,
      remoteAs: numberValue(remoteAs),
      state: validStates[stateStr],
      uptime,
      source: "ssh",
    };

    if (verboseData) {
      Object.assign(peer, {
        description: verboseData.description ?? null,
        name: verboseData.name ?? null,
        receivedPrefixes: verboseData.receivedPrefixes ?? null,
        advertisedPrefixes: verboseData.advertisedPrefixes ?? null,
        activePrefixes: verboseData.activePrefixes ?? null,
      });
    }

    peers.push(normalizeBgpPeer(peer as any));
  }

  if (addressFamilyHint) {
    return peers.map((peer) => ({ ...peer, addressFamily: addressFamilyHint }));
  }

  return peers;
}

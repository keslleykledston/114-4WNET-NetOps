import type { CopilotPeerAggregate, CopilotPeerMatch } from "./copilot.types.js";

function aggregateKey(peer: CopilotPeerMatch): string {
  return `${peer.peerIp}|${peer.remoteAs ?? ""}|${peer.vrf ?? ""}|${peer.role}`;
}

export function aggregatePeersAcrossDevices(peers: CopilotPeerMatch[]): CopilotPeerAggregate[] {
  const byKey = new Map<string, CopilotPeerAggregate>();

  for (const peer of peers) {
    const key = aggregateKey(peer);
    const current = byKey.get(key) ?? {
      peerIp: peer.peerIp,
      remoteAs: peer.remoteAs,
      vrf: peer.vrf,
      role: peer.role,
      devices: [],
      establishedCount: 0,
      downCount: 0,
    };

    current.devices.push({
      deviceId: peer.deviceId,
      deviceHostname: peer.deviceHostname,
      state: peer.state,
      uptime: peer.uptime,
      receivedPrefixes: peer.receivedPrefixes,
      advertisedPrefixes: peer.advertisedPrefixes,
      importPolicy: peer.importPolicy,
      exportPolicy: peer.exportPolicy,
    });

    if (peer.state === "Established") current.establishedCount += 1;
    else current.downCount += 1;

    byKey.set(key, current);
  }

  return [...byKey.values()].sort((left, right) => {
    const leftScore = left.establishedCount === left.devices.length ? 0 : 1;
    const rightScore = right.establishedCount === right.devices.length ? 0 : 1;
    return leftScore - rightScore || left.peerIp.localeCompare(right.peerIp);
  });
}

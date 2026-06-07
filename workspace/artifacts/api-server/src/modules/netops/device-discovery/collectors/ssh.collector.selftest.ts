import assert from "node:assert/strict";
import { parseBgpPeersFromResults } from "./ssh.collector.js";

function run(): void {
  const peers = parseBgpPeersFromResults([
    {
      command: "display bgp peer",
      output: [
        "172.28.1.138 0 262663 0 0 0 0404h17m Established",
      ].join("\n"),
    },
    {
      command: "display bgp peer verbose",
      output: [
        "BGP Peer is 172.28.1.138, remote AS 262663",
        "Peer's description: \"WIFIZAO.BRT\"",
        "BGP current state: Established, Up for 365d10h",
      ].join("\n"),
    },
  ]);

  assert.equal(peers.length, 1);
  assert.equal(peers[0]?.peerIp, "172.28.1.138");
  assert.equal(peers[0]?.description, "WIFIZAO.BRT");
  assert.equal(peers[0]?.state, "Established");
  assert.equal(peers[0]?.remoteAs, 262663);

  console.log("SSH BGP peer dedupe selftest PASS");
}

run();

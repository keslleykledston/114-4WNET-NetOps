import assert from "node:assert/strict";
import { parseBgpPeersFromResults } from "./ssh.collector.js";

function run(): void {
  const peers = parseBgpPeersFromResults([
    {
      command: "display bgp peer",
      output: [
        "2001:DB8::5 0 65001 0 0 0 0404h17m Established",
      ].join("\n"),
    },
    {
      command: "display bgp peer verbose",
      output: [
        "BGP Peer is 2001:db8::5, remote AS 65001",
        "Peer's description: \"WIFIZAO.BRT\"",
        "BGP current state: Established, Up for 365d10h",
      ].join("\n"),
    },
  ]);

  assert.equal(peers.length, 1);
  assert.equal(peers[0]?.peerIp, "2001:db8::5");
  assert.equal(peers[0]?.description, "WIFIZAO.BRT");
  assert.equal(peers[0]?.state, "Established");
  assert.equal(peers[0]?.remoteAs, 65001);

  console.log("SSH BGP peer dedupe selftest PASS");
}

run();

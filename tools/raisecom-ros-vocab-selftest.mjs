#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raisecomDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/raisecom-ros");

const code = `
import assert from "node:assert/strict";
import { RAISECOM_ROS_READONLY_COMMANDS, validateReadonlyCommand } from ${JSON.stringify(pathToFileURL(path.join(raisecomDir, "commands.ts")).href)};
import { parseRaisecomInterfaces } from ${JSON.stringify(pathToFileURL(path.join(raisecomDir, "parsers/interface-parser.ts")).href)};
import { parseRaisecomBgpPeers } from ${JSON.stringify(pathToFileURL(path.join(raisecomDir, "parsers/bgp-peer-parser.ts")).href)};

assert.ok(RAISECOM_ROS_READONLY_COMMANDS.includes("show running-config"), "vocab must include running-config");
assert.ok(RAISECOM_ROS_READONLY_COMMANDS.includes("show ip bgp summary"), "vocab must include bgp summary");
assert.equal(validateReadonlyCommand("show ip interface brief").allowed, true, "show command must be allowed");
assert.equal(validateReadonlyCommand("configure terminal").allowed, false, "config command must be blocked");

const interfaces = parseRaisecomInterfaces(\`
show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/1     10.10.10.1      YES NVRAM  up                    up
Loopback0              1.1.1.1         YES NVRAM  up                    up
\`);
assert.ok(interfaces.some((item) => item.name === "GigabitEthernet0/1"), "must parse GE interface");
assert.ok(interfaces.some((item) => item.name === "Loopback0"), "must parse loopback interface");

const peers = parseRaisecomBgpPeers(\`
show ip bgp summary
Neighbor        V         AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd
10.1.1.1        4      65001      10      11      0   0    0 1d02h 120
10.2.2.2        4      65002       0       0      0   0    0 00:05:11 Idle
\`);
assert.equal(peers.length, 2, "must parse two peers");
assert.equal(peers[0]?.state, "Established");
assert.equal(peers[0]?.receivedPrefixes, 120);
assert.equal(peers[1]?.state, "Idle");

console.log(JSON.stringify({
  ok: true,
  commandCount: RAISECOM_ROS_READONLY_COMMANDS.length,
  peers: peers.map((peer) => ({ peerIp: peer.peerIp, state: peer.state, receivedPrefixes: peer.receivedPrefixes })),
}, null, 2));
`;

const result = spawnSync("pnpm", ["dlx", "tsx", "-e", code], {
  cwd: rootDir,
  encoding: "utf8",
  env: process.env,
});

if (result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

console.log(result.stdout);
console.log("raisecom-ros-vocab-selftest: OK");

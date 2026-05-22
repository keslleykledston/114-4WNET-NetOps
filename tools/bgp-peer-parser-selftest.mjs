#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxBin = path.join(rootDir, "workspace/artifacts/netops-manager/node_modules/.bin/tsx");
const fixturesDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/__fixtures__");

function runTsx(code) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "netops-huawei-selftest-"));
  const tempFile = path.join(tempDir, "selftest.ts");
  writeFileSync(tempFile, code, "utf8");
  const result = spawnSync(tsxBin, [tempFile], {
    cwd: rootDir,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://netops:netops@127.0.0.1:5435/netops",
    },
    encoding: "utf8",
  });
  rmSync(tempDir, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error(`selftest failed\nSTDOUT:\n${result.stdout ?? ""}\nSTDERR:\n${result.stderr ?? ""}`);
  }
  return result.stdout;
}

const fixtures = {
  bgpVerbose: readFileSync(path.join(fixturesDir, "bgp-peer-verbose-sample.txt"), "utf8"),
  routePolicy: readFileSync(path.join(fixturesDir, "route-policy-sample.txt"), "utf8"),
  communities: readFileSync(path.join(fixturesDir, "community-sample.txt"), "utf8"),
  interfaces: readFileSync(path.join(fixturesDir, "interface-sample.txt"), "utf8"),
  l2vpn: readFileSync(path.join(fixturesDir, "l2vpn-sample.txt"), "utf8"),
};

const code = `
import assert from "node:assert/strict";
import { parseHuaweiBgpPeers } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/bgp-peer-parser.ts")).href)};
import { parseHuaweiPolicies } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-parser.ts")).href)};
import { parseRunningConfigCommunities } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/community-parser.ts")).href)};
import { parseHuaweiInterfaces } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/interface-parser.ts")).href)};
import { parseHuaweiL2vpn } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/l2vpn-parser.ts")).href)};

const fixtures = ${JSON.stringify(fixtures)};

async function main() {
  const peers = parseHuaweiBgpPeers(fixtures.bgpVerbose);
  assert.equal(peers.length, 2);
  assert.equal(peers[0].peerIp, "10.20.1.5");
  assert.equal(peers[0].description, "C35-BGP-BVA-MNS");
  assert.equal(peers[0].name, "C35-BGP-BVA-MNS");
  assert.equal(peers[0].state, "Established");
  assert.equal(peers[0].sessionType, "eBGP");
  assert.equal(peers[0].receivedPrefixes, 0);
  assert.equal(peers[0].advertisedPrefixes, 10);
  assert.equal(peers[1].peerIp, "2001:db8::5");
  assert.equal(peers[1].sessionType, "iBGP");
  assert.equal(peers[1].state, "Idle");
  assert.equal(peers[1].receivedPrefixes, 128);
  assert.equal(peers[1].advertisedPrefixes, 12);

  const policies = parseHuaweiPolicies(fixtures.routePolicy);
  const inbound = policies.find((item) => item.name === "CUST-IN");
  const outbound = policies.find((item) => item.name === "CUST-OUT");
  const ipPrefix = policies.find((item) => item.type === "ip-prefix");
  assert(inbound);
  assert(outbound);
  assert(ipPrefix);
  assert.equal(inbound.entries.length, 1);
  assert.equal(inbound.entries[0].sequence, 10);
  assert(inbound.entries[0].matches.some((item) => item.includes("ip-prefix CUST-IN-PFX")));
  assert(inbound.entries[0].matches.some((item) => item.includes("community-filter CUST-CF")));
  assert.equal(outbound.entries.length, 1);
  assert(outbound.entries[0].matches.some((item) => item.includes("community-list CUST-LIST")));
  assert(outbound.entries[0].applies.some((item) => item.includes("apply community")));

  const community = parseRunningConfigCommunities(fixtures.communities);
  assert.equal(community.communityFilters.length, 2);
  assert.equal(community.communityLists.some((item) => item.listName === "CUST-LIST"), true);
  assert.equal(community.communityLists.some((item) => item.listName === "EMPTY-LIST"), true);

  const interfaces = parseHuaweiInterfaces(fixtures.interfaces);
  assert.equal(interfaces.length, 4);
  assert.equal(interfaces[0].kind, "physical");
  assert.equal(interfaces[0].description, "Uplink-1");
  assert.equal(interfaces[1].kind, "subinterface");
  assert.equal(interfaces[1].vlanId, 100);
  assert.equal(interfaces[1].encapsulation, "dot1q 100");
  assert.equal(interfaces[2].kind, "subinterface");
  assert.equal(interfaces[2].encapsulation, "qinq vlan 200 to 300");
  assert.equal(interfaces[3].kind, "loopback");
  assert.equal(interfaces[3].description, "Router-ID");

  const l2vpn = parseHuaweiL2vpn(fixtures.l2vpn);
  assert.equal(l2vpn.l2vcs.length, 2);
  assert.equal(l2vpn.vsis.length, 2);
  assert.equal(l2vpn.l2vcs[0].vcId, "1000");
  assert.equal(l2vpn.l2vcs[1].state, null);
  assert.equal(l2vpn.vsis[0].name, "CUST-VSI-1");
  assert.equal(l2vpn.vsis[1].state, "down");

  console.log("bgp-peer-parser selftest passed");
}

main();
`;

runTsx(code);

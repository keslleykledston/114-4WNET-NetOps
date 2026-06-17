#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxBin = path.join(rootDir, "workspace/artifacts/netops-manager/node_modules/.bin/tsx");

function runTsx(code) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "netops-bgp-uptime-merge-"));
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
}

runTsx(`
import assert from "node:assert/strict";
import { mergeReadonlyBgpPeers } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/service.ts")).href)};

const merged = mergeReadonlyBgpPeers(
  [{
    peerIp: "2804:5984:B000::6",
    remoteAs: 268707,
    description: null,
    name: null,
    state: "Active",
    role: "customer",
    roleSource: "classifier",
    addressFamily: "ipv6",
    sessionType: "eBGP",
    vrf: null,
    importPolicy: null,
    exportPolicy: null,
    receivedPrefixes: null,
    advertisedPrefixes: null,
    activePrefixes: null,
    uptime: "12345",
    source: "snmp",
  }],
  [{
    peerIp: "2804:5984:B000::6",
    remoteAs: 268707,
    description: null,
    name: null,
    state: "Active",
    role: "customer",
    roleSource: "classifier",
    addressFamily: "ipv6",
    sessionType: "eBGP",
    vrf: null,
    importPolicy: null,
    exportPolicy: null,
    receivedPrefixes: null,
    advertisedPrefixes: null,
    activePrefixes: null,
    uptime: "****h36m",
    source: "ssh",
  }],
);

assert.equal(merged.length, 1);
assert.equal(merged[0].uptime, "12345");

const unionMerged = mergeReadonlyBgpPeers(
  [{
    peerIp: "10.20.1.5",
    remoteAs: 270966,
    description: null,
    name: null,
    state: "Established",
    role: "provider",
    roleSource: "classifier",
    addressFamily: "ipv4",
    sessionType: "eBGP",
    vrf: null,
    importPolicy: null,
    exportPolicy: null,
    receivedPrefixes: null,
    advertisedPrefixes: null,
    activePrefixes: null,
    uptime: "12345",
    source: "snmp",
  }],
  [{
    peerIp: "2001:db8::6",
    remoteAs: 65001,
    description: "IPv6-UPLINK",
    name: "IPv6-UPLINK",
    state: "Established",
    role: "provider",
    roleSource: "classifier",
    addressFamily: "ipv6",
    sessionType: "eBGP",
    vrf: null,
    importPolicy: null,
    exportPolicy: null,
    receivedPrefixes: null,
    advertisedPrefixes: null,
    activePrefixes: null,
    uptime: "12d3h",
    source: "ssh",
  }],
);

assert.equal(unionMerged.length, 1, "SSH-only peers must not be unioned into SNMP list");
assert.equal(unionMerged[0].peerIp, "10.20.1.5");

const numericOnly = mergeReadonlyBgpPeers(
  [{
    peerIp: "10.20.1.5",
    remoteAs: 270966,
    description: null,
    name: null,
    state: "Established",
    role: "provider",
    roleSource: "classifier",
    addressFamily: "ipv4",
    sessionType: "eBGP",
    vrf: null,
    importPolicy: null,
    exportPolicy: null,
    receivedPrefixes: null,
    advertisedPrefixes: null,
    activePrefixes: null,
    uptime: null,
    source: "snmp",
  }],
  [{
    peerIp: "10.20.1.5",
    remoteAs: 270966,
    description: null,
    name: null,
    state: "Established",
    role: "provider",
    roleSource: "classifier",
    addressFamily: "ipv4",
    sessionType: "eBGP",
    vrf: null,
    importPolicy: null,
    exportPolicy: null,
    receivedPrefixes: null,
    advertisedPrefixes: null,
    activePrefixes: null,
    uptime: "12345",
    source: "ssh",
  }],
);

assert.equal(numericOnly[0].uptime, null);
assert.equal(numericOnly[0].source, "snmp");
console.log("bgp-readonly-uptime-merge selftest passed");
`);

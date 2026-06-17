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
  const tempDir = mkdtempSync(path.join(tmpdir(), "netops-bgp-discovery-fallback-"));
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
import { shouldCollectSshBgpDetails, shouldFallbackToSshForIpv6Bgp } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/device-discovery/discovery.orchestrator.ts")).href)};

const request = {
  contexts: ["bgp"],
  preferLiveSsh: false,
  allowSnmpFallback: true,
  useCachedConfig: false,
} as const;

assert.equal(shouldFallbackToSshForIpv6Bgp(request, [{
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
}], true), true);

assert.equal(shouldFallbackToSshForIpv6Bgp(request, [{
  peerIp: "2001:db8::5",
  remoteAs: 65001,
  description: null,
  name: null,
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
  uptime: null,
  source: "snmp",
}], true), false);

assert.equal(shouldCollectSshBgpDetails(request, true), true);
assert.equal(shouldCollectSshBgpDetails({ ...request, contexts: ["interfaces"] }, true), false);
assert.equal(shouldCollectSshBgpDetails(request, false), false);
assert.equal(shouldFallbackToSshForIpv6Bgp({ ...request, preferLiveSsh: true }, [], true), false);
assert.equal(shouldFallbackToSshForIpv6Bgp({ ...request, allowSnmpFallback: false }, [], true), false);
assert.equal(shouldFallbackToSshForIpv6Bgp(request, [], false), false);
console.log("bgp-discovery-ssh-fallback selftest passed");
`);

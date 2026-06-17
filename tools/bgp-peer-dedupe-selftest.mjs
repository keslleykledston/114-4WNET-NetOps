#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxBin = path.join(repoRoot, "workspace/artifacts/netops-manager/node_modules/.bin/tsx");

function runTsx(code) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "netops-bgp-peer-dedupe-"));
  const tempFile = path.join(tempDir, "selftest.ts");
  writeFileSync(tempFile, code, "utf8");
  const result = spawnSync(tsxBin, [tempFile], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });
  rmSync(tempDir, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error(`selftest failed\nSTDOUT:\n${result.stdout ?? ""}\nSTDERR:\n${result.stderr ?? ""}`);
  }
}

const code = `
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

(async () => {
const repoRoot = ${JSON.stringify(repoRoot)};
const api = await import(${JSON.stringify(pathToFileURL(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/netops/bgp/bgp-peer-display-normalizer.ts")).href)});
const ui = await import(${JSON.stringify(pathToFileURL(path.join(repoRoot, "workspace/artifacts/netops-manager/src/features/bgp/bgp-peer-list-utils.ts")).href)});

function assertSameDedupe(input) {
  const apiResult = JSON.stringify(api.dedupeBgpPeersForDisplay(input));
  const uiResult = JSON.stringify(ui.dedupeBgpPeersForDisplay(input));
  assert.equal(apiResult, uiResult, "api and ui dedupe must stay in sync");
  return JSON.parse(apiResult);
}

const snmpNoMeta = {
  peerIp: "45.169.161.138",
  remoteAs: 268707,
  description: null,
  name: null,
  state: "Established",
  role: "provider",
  addressFamily: "ipv4",
  vrf: null,
  source: "snmp",
};

const sshWithMeta = {
  peerIp: "45.169.161.138",
  remoteAs: 268707,
  description: "C15-EDGE",
  name: "C15-EDGE",
  state: "Established",
  role: "provider",
  addressFamily: "ipv4",
  vrf: "CDN",
  source: "ssh",
};

const vrfDuplicate = assertSameDedupe([snmpNoMeta, sshWithMeta]);
assert.equal(vrfDuplicate.length, 1);
assert.equal(vrfDuplicate[0].description, "C15-EDGE");
assert.equal(vrfDuplicate[0].name, "C15-EDGE");
assert.equal(vrfDuplicate[0].vrf, "CDN");

const sameKeyMerge = assertSameDedupe([
  { peerIp: "10.1.1.1", addressFamily: "ipv4", vrf: "CDN", remoteAs: 65001, description: null, source: "snmp" },
  { peerIp: "10.1.1.1", addressFamily: "ipv4", vrf: "CDN", remoteAs: 65001, description: "CLIENTE-A", source: "ssh" },
]);
assert.equal(sameKeyMerge.length, 1);
assert.equal(sameKeyMerge[0].description, "CLIENTE-A");

const dualStack = assertSameDedupe([
  { peerIp: "10.1.1.1", addressFamily: "ipv4", vrf: null, remoteAs: 65001, source: "snmp" },
  { peerIp: "10.1.1.1", addressFamily: "ipv6", vrf: null, remoteAs: 65001, source: "snmp" },
]);
assert.equal(dualStack.length, 2);

const trueMultiVrf = assertSameDedupe([
  { peerIp: "10.2.2.2", addressFamily: "ipv4", vrf: "CDN", remoteAs: 65002, description: "CDN-PEER", source: "ssh" },
  { peerIp: "10.2.2.2", addressFamily: "ipv4", vrf: "IX", remoteAs: 65002, description: "IX-PEER", source: "ssh" },
]);
assert.equal(trueMultiVrf.length, 2);

const globalAlias = assertSameDedupe([
  { peerIp: "10.3.3.3", addressFamily: "ipv4", vrf: "GLOBAL", remoteAs: 65003, description: "GLOBAL-LABEL", source: "ssh" },
  { peerIp: "10.3.3.3", addressFamily: "ipv4", vrf: null, remoteAs: 65003, description: null, source: "snmp" },
]);
assert.equal(globalAlias.length, 1);
assert.equal(globalAlias[0].description, "GLOBAL-LABEL");

console.log("bgp-peer-dedupe selftest passed");
})();
`;

runTsx(code);

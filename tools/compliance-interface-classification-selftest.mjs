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
  const tempDir = mkdtempSync(path.join(tmpdir(), "netops-compliance-interface-selftest-"));
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

const code = `
import assert from "node:assert/strict";
import {
  isIpAddress,
  isHuaweiInterfaceName,
  isHuaweiSubinterfaceName,
} from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/compliance/interface-identifiers.ts")).href)};
import { runInterfaceChecks } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/compliance/checks/interface-checks.ts")).href)};
import { parseHuaweiInterfaces } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/interface-parser.ts")).href)};

function contextWithInterfaces(interfaces) {
  return {
    device: { id: 1, hostname: "router-1" },
    contexts: ["interface"],
    snapshotRow: null,
    snapshot: {
      deviceId: 1,
      discoveryRunId: "test",
      status: "full",
      contexts: ["interfaces"],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      sourceStatus: { ssh: "success", snmp: "skipped", cachedConfig: "skipped" },
      sourcesUsed: ["ssh_live"],
      interfaces,
      bgpPeers: [],
      policies: [],
      communities: [],
      communityLists: [],
      prefixLists: [],
      vrfs: [],
      l2vpn: { source: "ssh_live", confidence: "high", l2vcs: [], vsis: [] },
      warnings: [],
      audit: [],
    },
    collectedConfig: null,
    rawConfig: "",
    source: "ssh_live",
    confidence: "high",
    profile: null,
  };
}

assert.equal(isIpAddress("45.169.161.6"), true);
assert.equal(isIpAddress("200.219.146.254"), true);
assert.equal(isIpAddress("10.20.1.1"), true);
assert.equal(isIpAddress("2804:abcd::1"), true);
assert.equal(isHuaweiSubinterfaceName("45.169.161.6"), false);
assert.equal(isHuaweiSubinterfaceName("200.219.146.254"), false);
assert.equal(isHuaweiSubinterfaceName("189.23.156.121"), false);
assert.equal(isHuaweiSubinterfaceName("Eth-Trunk5.2001"), true);
assert.equal(isHuaweiSubinterfaceName("GigabitEthernet0/0/1.100"), true);
assert.equal(isHuaweiSubinterfaceName("100GE0/0/1.4094"), true);
assert.equal(isHuaweiSubinterfaceName("interface"), false);
assert.equal(isHuaweiSubinterfaceName(""), false);
assert.equal(isHuaweiInterfaceName("Eth-Trunk0"), true);
assert.equal(isHuaweiInterfaceName("XGigabitEthernet0/0/1"), true);
assert.equal(isHuaweiInterfaceName("10GE0/0/1"), true);
assert.equal(isHuaweiInterfaceName("25GE0/0/1"), true);
assert.equal(isHuaweiInterfaceName("40GE0/0/1"), true);
assert.equal(isHuaweiInterfaceName("100GE0/0/1"), true);
assert.equal(isHuaweiInterfaceName("LoopBack0"), true);
assert.equal(isHuaweiInterfaceName("Vlanif100"), true);
assert.equal(isHuaweiInterfaceName("NULL0"), true);

const parsed = parseHuaweiInterfaces([
  "45.169.161.6 0 0 0 0199h07m Established 1051135",
  "Eth-Trunk5.2001 up up customer vlan",
].join("\\n"));
assert.deepEqual(parsed.map((item) => item.name), ["Eth-Trunk5.2001"]);

const ipOnlyFindings = runInterfaceChecks(contextWithInterfaces([
  {
    name: "45.169.161.6",
    description: null,
    adminStatus: "unknown",
    operStatus: "unknown",
    ipv4: [],
    ipv6: [],
    vlan: 6,
    vrf: null,
    source: "ssh",
    kind: "subinterface",
    evidence: "interface 45.169.161.6",
    confidence: "high",
  },
]));
assert.equal(ipOnlyFindings.some((finding) => finding.message.includes("Subinterface sem dot1q")), false);

const missingDot1qFindings = runInterfaceChecks(contextWithInterfaces([
  {
    name: "Eth-Trunk5.2001",
    description: "customer",
    adminStatus: "up",
    operStatus: "up",
    ipv4: ["45.169.161.6/30"],
    ipv6: [],
    vlan: 2001,
    vrf: null,
    source: "ssh",
    kind: "subinterface",
    evidence: "interface Eth-Trunk5.2001",
    confidence: "high",
  },
]));
const missingDot1q = missingDot1qFindings.find((finding) => finding.policyKey === "huawei-subinterface-dot1q");
assert(missingDot1q);
assert.equal(missingDot1q.objectName, "Eth-Trunk5.2001");
assert.equal(isIpAddress(missingDot1q.objectName), false);

for (const finding of [...ipOnlyFindings, ...missingDot1qFindings]) {
  if (finding.context === "interface" && finding.policyKey === "huawei-subinterface-dot1q") {
    assert.equal(isIpAddress(finding.objectName ?? ""), false);
  }
}

console.log("compliance-interface-classification selftest passed");
`;

runTsx(code);

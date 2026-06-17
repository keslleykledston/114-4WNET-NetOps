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
  const tempDir = mkdtempSync(path.join(tmpdir(), "netops-change-plans-"));
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
const { computeChangeDiff } = await import(${JSON.stringify(pathToFileURL(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/change-plans/change-plans.diff-engine.ts")).href)});
const { buildBgpCleanupRollbackDocument, buildChangePlanInputFromBgpCleanup } = await import(${JSON.stringify(pathToFileURL(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/change-plans/adapters/bgp-cleanup.adapter.ts")).href)});

const beforeState = {
  "bgp-peer": [{ name: "172.22.151.22", remoteAs: 65001 }],
  "route-policy": [{ name: "AS270966-MS-FIBRA-Import" }],
  "community-filter": [{ name: "C07-RECEIVED" }, { name: "XPAND-CF" }],
};

const afterState = {
  "bgp-peer": [],
  "route-policy": [],
  "community-filter": [{ name: "C07-RECEIVED" }],
};

const diff = computeChangeDiff({ beforeState, afterState });
assert.ok(diff.removed.length >= 2);
assert.ok(diff.removed.some((item) => item.type === "bgp-peer" && item.name === "172.22.151.22"));
assert.ok(diff.removed.some((item) => item.type === "route-policy"));
assert.ok(diff.unchanged.some((item) => item.name === "C07-RECEIVED"));
assert.ok(diff.removed.some((item) => item.name === "XPAND-CF"));

const analysis = {
  analysisId: 1,
  deviceId: 1,
  peerIp: "172.22.151.22",
  vrf: "CDN",
  afi: "ipv4",
  safi: "unicast",
  peerRole: null,
  peerCategory: null,
  state: "Active",
  peerAs: 65001,
  localAs: 268707,
  importPolicies: ["AS270966-MS-FIBRA-Import"],
  exportPolicies: [],
  recommendation: "full",
  riskLevel: "low",
  dependencies: {
    exclusive: [
      { type: "route-policy", name: "AS270966-MS-FIBRA-Import", status: "exclusive", users: [{ peerIp: "172.22.151.22", state: "Active", vrf: "CDN", afi: "ipv4", safi: "unicast" }], evidence: "exclusive" },
      { type: "community-filter", name: "XPAND-CF", status: "exclusive", users: [], evidence: "exclusive" },
    ],
    shared: [],
    global: [{ type: "community-filter", name: "C07-RECEIVED", status: "global", users: [], evidence: "global", reason: "Dependência global compartilhada por desenho operacional." }],
    ambiguous: [],
  },
  script: {
    removalCommands: ["system-view", "bgp 268707", "undo peer 172.22.151.22"],
    validationBefore: ["display bgp peer 172.22.151.22 verbose"],
    validationAfter: [],
    sha256: "abc",
  },
  warnings: [],
  blockedReasons: [],
  twin: null,
  collectedAt: "2026-06-06T00:00:00.000Z",
  snapshotSource: "ssh_running_config",
};

const peer = {
  peerIp: "172.22.151.22",
  vrf: "CDN",
  addressFamily: "ipv4",
  state: "Active",
  remoteAs: 65001,
  importPolicy: "AS270966-MS-FIBRA-Import",
  exportPolicy: null,
};

const snapshot = {
  deviceId: 1,
  bgpPeers: [peer],
  policies: [],
  communities: [{ name: "C07-RECEIVED" }, { name: "XPAND-CF" }],
  communityLists: [],
  prefixLists: [],
  ipv6PrefixLists: [],
  asPathFilters: [],
  extcommunityFilters: [],
};

const drilldown = {
  root: { group: null },
  effectivePolicies: [{ policyName: "AS270966-MS-FIBRA-Import", direction: "import" }],
  policies: [{ name: "AS270966-MS-FIBRA-Import", dependencies: [] }],
};

const rollback = buildBgpCleanupRollbackDocument({ analysis, peer, snapshot });
assert.equal(rollback.valid, true);
assert.ok(rollback.script.some((line) => line.includes("peer 172.22.151.22 as-number 65001")));

const planInput = buildChangePlanInputFromBgpCleanup({
  analysis,
  peer,
  snapshot,
  drilldown,
  hostname: "lab-router",
  sourceAnalysisId: 99,
});
assert.equal(planInput.module, "bgp_cleanup");
assert.equal(planInput.changeType, "peer_removal");
assert.ok(planInput.items.some((item) => item.itemType === "bgp-peer" && item.willBeRemoved));
assert.ok(planInput.items.some((item) => item.itemName === "C07-RECEIVED" && item.classification === "global" && !item.willBeRemoved));
assert.ok(planInput.rollback.valid);

console.log("change-plans selftest passed");
})();
`;

runTsx(code);

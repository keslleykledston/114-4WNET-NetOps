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
  const tempDir = mkdtempSync(path.join(tmpdir(), "netops-bgp-peer-cleanup-"));
  const tempFile = path.join(tempDir, "selftest.ts");
  writeFileSync(tempFile, code, "utf8");
  const result = spawnSync(tsxBin, [tempFile], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://netops:netops@127.0.0.1:5435/netops",
    },
  });
  rmSync(tempDir, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error(`selftest failed\nSTDOUT:\n${result.stdout ?? ""}\nSTDERR:\n${result.stderr ?? ""}`);
  }
}

function makePeer(overrides = {}) {
  return {
    peerIp: "10.0.0.1",
    vrf: null,
    addressFamily: "ipv4",
    state: "Active",
    remoteAs: 65001,
    name: "PEER",
    description: "peer",
    role: "ebgp",
    category: "ebgp",
    importPolicy: null,
    exportPolicy: null,
    source: "ssh_running_config",
    primaryDirection: "internal",
    largeReceivedRoutes: false,
    largeAdvertisedRoutes: false,
    autoLoadRoutes: false,
    requiresExplicitRouteSearch: false,
    ...overrides,
  };
}

function makeDependency(type, name, extra = {}) {
  return {
    type,
    name,
    ...extra,
  };
}

function makeRoutePolicy(name, deps, source = "ssh_running_config") {
  return {
    name,
    source,
    nodes: [
      {
        sequence: 10,
        action: "permit",
        matches: deps.map((dep) => `if-match ${dep.type} ${dep.name}`),
        matchDetails: deps.map((dep) => ({
          type: dep.type,
          name: dep.name,
          raw: `if-match ${dep.type} ${dep.name}`,
        })),
        applies: [],
        evidence: {
          source,
          confidence: "high",
          evidence: `route-policy ${name}`,
        },
      },
    ],
  };
}

function makeDrilldownPolicy(name, direction, afiSafi, deps, status = "FOUND") {
  return {
    name,
    direction,
    afiSafi,
    nodes: [
      {
        sequence: 10,
        action: "permit",
        matches: [],
        applies: [],
        control: [],
      },
    ],
    dependencies: deps.map((dep) => ({
      routePolicy: name,
      node: 10,
      dependencyType: dep.type,
      dependencyName: dep.name,
      raw: `if-match ${dep.type} ${dep.name}`,
      source: dep.source ?? "ssh_running_config",
      status,
      evidence: `${dep.type} ${dep.name}`,
    })),
    status,
  };
}

function makeSnapshot({
  peers,
  policies,
  communities = [],
  prefixLists = [],
  ipv6PrefixLists = [],
  asPathFilters = [],
  extcommunityFilters = [],
  aclFilters = [],
  sourcesUsed = ["ssh_running_config"],
}) {
  return {
    deviceId: 1,
    discoveryRunId: "cleanup-selftest",
    status: "full",
    contexts: ["bgp"],
    startedAt: "2026-06-04T00:00:00.000Z",
    finishedAt: "2026-06-04T00:00:01.000Z",
    sourceStatus: {
      ssh: "success",
      snmp: "skipped",
      cachedConfig: "available",
    },
    sourcesUsed,
    interfaces: [],
    bgpPeers: peers,
    policies,
    communities,
    communityLists: [],
    prefixLists,
    ipv6PrefixLists,
    asPathFilters,
    extcommunityFilters,
    aclFilters,
    vrfs: [],
    l2vpn: { l2vcs: [], vsis: [] },
    warnings: [],
    audit: [],
  };
}

const exclusiveDeps = [
  makeDependency("route-policy", "XPAND-CDN-IN"),
  makeDependency("ip-prefix", "XPAND-CDN-PFX"),
  makeDependency("community-filter", "XPAND-CDN-CF"),
];
const sharedDeps = [
  makeDependency("route-policy", "C15-EXPORT"),
  makeDependency("ip-prefix", "C15-SHARED-PFX"),
];
const ambiguousDeps = [
  makeDependency("route-policy", "ALLFIBER-IMPORT"),
  makeDependency("ipv6-prefix", "ALLFIBER-V6"),
];

const snapshotExclusive = makeSnapshot({
  peers: [
    makePeer({
      peerIp: "172.28.0.14",
      vrf: "XPAND-CDN",
      addressFamily: "ipv4",
      state: "Active",
      remoteAs: 64512,
      name: "XPAND-CDN",
      description: "XPAND-CDN",
      importPolicy: "XPAND-CDN-IN",
      exportPolicy: "XPAND-CDN-OUT",
    }),
  ],
  policies: [
    makeRoutePolicy("XPAND-CDN-IN", exclusiveDeps),
    makeRoutePolicy("XPAND-CDN-OUT", []),
  ],
  communities: [{ name: "XPAND-CDN-CF", entries: [], source: "ssh_running_config", confidence: "high" }],
  prefixLists: [{ name: "XPAND-CDN-PFX", entries: [], source: "ssh_running_config", confidence: "high" }],
});

const drilldownExclusive = {
  contractVersion: "bgp-peer-drilldown-v1",
  deviceId: 1,
  peer: "172.28.0.14",
  source: "ssh_detail",
  collectedAt: "2026-06-04T00:00:01.000Z",
  configBuildSource: "snapshot_aggregate",
  snapshotId: 10,
  root: {
    peer: "172.28.0.14",
    asNumber: 64512,
    description: "XPAND-CDN",
    group: null,
    connectInterface: null,
    timers: null,
    passwordPresent: false,
    source: "ssh_detail",
    status: "FOUND",
  },
  families: [],
  effectivePolicies: [
    {
      afiSafi: "ipv4_unicast",
      vrf: "XPAND-CDN",
      direction: "import",
      policyName: "XPAND-CDN-IN",
      source: "peer",
      inheritedFromGroup: false,
      inheritedGroup: null,
      status: "FOUND",
    },
  ],
  policies: [
    makeDrilldownPolicy("XPAND-CDN-IN", "import", "ipv4_unicast", exclusiveDeps),
  ],
  dependencies: [],
  runtime: null,
  routeTables: {
    received: { requested: false, available: false, prefixCount: null },
    accepted: { requested: false, available: false, prefixCount: null },
    advertised: { requested: false, available: false, prefixCount: null },
  },
  warnings: [],
  rawEvidenceRefs: [],
};

const snapshotShared = makeSnapshot({
  peers: [
    makePeer({
      peerIp: "45.169.161.138",
      vrf: "CDN",
      addressFamily: "ipv4",
      state: "Active",
      remoteAs: 268707,
      name: "C15-EDGE",
      description: "C15-EDGE",
      importPolicy: "C15-EXPORT",
      exportPolicy: null,
    }),
    makePeer({
      peerIp: "45.169.161.139",
      vrf: "CDN",
      addressFamily: "ipv4",
      state: "Established",
      remoteAs: 268707,
      name: "C15-EDGE",
      description: "C15-EDGE",
      importPolicy: "C15-EXPORT",
      exportPolicy: null,
    }),
  ],
  policies: [
    makeRoutePolicy("C15-EXPORT", sharedDeps),
  ],
  communities: [{ name: "C15-SHARED-CF", entries: [], source: "ssh_running_config", confidence: "high" }],
  prefixLists: [{ name: "C15-SHARED-PFX", entries: [], source: "ssh_running_config", confidence: "high" }],
});

const drilldownShared = {
  contractVersion: "bgp-peer-drilldown-v1",
  deviceId: 1,
  peer: "45.169.161.138",
  source: "ssh_detail",
  collectedAt: "2026-06-04T00:00:01.000Z",
  configBuildSource: "snapshot_aggregate",
  snapshotId: 11,
  root: {
    peer: "45.169.161.138",
    asNumber: 268707,
    description: "C15-EDGE",
    group: null,
    connectInterface: null,
    timers: null,
    passwordPresent: false,
    source: "ssh_detail",
    status: "FOUND",
  },
  families: [],
  effectivePolicies: [
    {
      afiSafi: "ipv4_unicast",
      vrf: "CDN",
      direction: "import",
      policyName: "C15-EXPORT",
      source: "peer",
      inheritedFromGroup: false,
      inheritedGroup: null,
      status: "FOUND",
    },
  ],
  policies: [
    makeDrilldownPolicy("C15-EXPORT", "import", "ipv4_unicast", sharedDeps),
  ],
  dependencies: [],
  runtime: null,
  routeTables: {
    received: { requested: false, available: false, prefixCount: null },
    accepted: { requested: false, available: false, prefixCount: null },
    advertised: { requested: false, available: false, prefixCount: null },
  },
  warnings: [],
  rawEvidenceRefs: [],
};

const snapshotTwin = makeSnapshot({
  peers: [
    makePeer({
      peerIp: "10.20.255.10",
      vrf: "CDN",
      addressFamily: "ipv4",
      state: "Connect",
      remoteAs: 65010,
      name: "TWIN-CDN",
      description: "TWIN-CDN",
      importPolicy: null,
      exportPolicy: null,
    }),
    makePeer({
      peerIp: "10.20.255.11",
      vrf: "CDN",
      addressFamily: "ipv6",
      state: "Established",
      remoteAs: 65010,
      name: "TWIN-CDN",
      description: "TWIN-CDN",
      importPolicy: null,
      exportPolicy: null,
    }),
  ],
  policies: [],
});

const drilldownTwin = {
  contractVersion: "bgp-peer-drilldown-v1",
  deviceId: 1,
  peer: "10.20.255.10",
  source: "ssh_detail",
  collectedAt: "2026-06-04T00:00:01.000Z",
  configBuildSource: "snapshot_aggregate",
  snapshotId: 12,
  root: {
    peer: "10.20.255.10",
    asNumber: 65010,
    description: "TWIN-CDN",
    group: null,
    connectInterface: null,
    timers: null,
    passwordPresent: false,
    source: "ssh_detail",
    status: "FOUND",
  },
  families: [],
  effectivePolicies: [],
  policies: [],
  dependencies: [],
  runtime: null,
  routeTables: {
    received: { requested: false, available: false, prefixCount: null },
    accepted: { requested: false, available: false, prefixCount: null },
    advertised: { requested: false, available: false, prefixCount: null },
  },
  warnings: [],
  rawEvidenceRefs: [],
};

const snapshotAmbiguous = makeSnapshot({
  peers: [
    makePeer({
      peerIp: "172.28.1.22",
      vrf: "ALLFIBER",
      addressFamily: "ipv6",
      state: "Idle",
      remoteAs: 65122,
      name: "ALLFIBER",
      description: "ALLFIBER",
      importPolicy: null,
      exportPolicy: null,
    }),
  ],
  policies: [
    makeRoutePolicy("ALLFIBER-IMPORT", ambiguousDeps),
  ],
  ipv6PrefixLists: [{ name: "ALLFIBER-V6", entries: [], source: "ssh_running_config", confidence: "high" }],
});

const drilldownAmbiguous = {
  contractVersion: "bgp-peer-drilldown-v1",
  deviceId: 1,
  peer: "172.28.1.22",
  source: "ssh_detail",
  collectedAt: "2026-06-04T00:00:01.000Z",
  configBuildSource: "snapshot_aggregate",
  snapshotId: 13,
  root: {
    peer: "172.28.1.22",
    asNumber: 65122,
    description: "ALLFIBER",
    group: null,
    connectInterface: null,
    timers: null,
    passwordPresent: false,
    source: "ssh_detail",
    status: "FOUND",
  },
  families: [],
  effectivePolicies: [
    {
      afiSafi: "ipv6_unicast",
      vrf: "ALLFIBER",
      direction: "import",
      policyName: "ALLFIBER-IMPORT",
      source: "peer",
      inheritedFromGroup: false,
      inheritedGroup: null,
      status: "FOUND",
    },
  ],
  policies: [
    makeDrilldownPolicy("ALLFIBER-IMPORT", "import", "ipv6_unicast", ambiguousDeps),
  ],
  dependencies: [],
  runtime: null,
  routeTables: {
    received: { requested: false, available: false, prefixCount: null },
    accepted: { requested: false, available: false, prefixCount: null },
    advertised: { requested: false, available: false, prefixCount: null },
  },
  warnings: [],
  rawEvidenceRefs: [],
};

const snapshotConnect = makeSnapshot({
  peers: [
    makePeer({
      peerIp: "10.20.0.30",
      vrf: "CDN",
      addressFamily: "ipv4",
      state: "Connect",
      remoteAs: 65030,
      name: "CONNECT-CDN",
      description: "CONNECT-CDN",
      importPolicy: null,
      exportPolicy: null,
    }),
  ],
  policies: [],
});

const drilldownConnect = {
  contractVersion: "bgp-peer-drilldown-v1",
  deviceId: 1,
  peer: "10.20.0.30",
  source: "ssh_detail",
  collectedAt: "2026-06-04T00:00:01.000Z",
  configBuildSource: "snapshot_aggregate",
  snapshotId: 14,
  root: {
    peer: "10.20.0.30",
    asNumber: 65030,
    description: "CONNECT-CDN",
    group: null,
    connectInterface: null,
    timers: null,
    passwordPresent: false,
    source: "ssh_detail",
    status: "FOUND",
  },
  families: [],
  effectivePolicies: [],
  policies: [],
  dependencies: [],
  runtime: null,
  routeTables: {
    received: { requested: false, available: false, prefixCount: null },
    accepted: { requested: false, available: false, prefixCount: null },
    advertised: { requested: false, available: false, prefixCount: null },
  },
  warnings: [],
  rawEvidenceRefs: [],
};

const code = `
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

(async () => {
const repoRoot = ${JSON.stringify(repoRoot)};
const { analyzeBgpPeerCleanupDependencies, findTwinPeer } = await import(${JSON.stringify(pathToFileURL(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/bgp-drill-cleanup/bgp-drill-cleanup.dependency-analyzer.ts")).href)});
const { buildBgpPeerCleanupScript, buildBgpPeerCleanupMarkdown } = await import(${JSON.stringify(pathToFileURL(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/bgp-drill-cleanup/bgp-drill-cleanup.command-builder.ts")).href)});
const { buildBgpPeerCleanupAnalysis, classifyBgpPeerCleanup } = await import(${JSON.stringify(pathToFileURL(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/bgp-drill-cleanup/bgp-drill-cleanup.service.ts")).href)});

const snapshotExclusive = ${JSON.stringify(snapshotExclusive)};
const drilldownExclusive = ${JSON.stringify(drilldownExclusive)};
const snapshotShared = ${JSON.stringify(snapshotShared)};
const drilldownShared = ${JSON.stringify(drilldownShared)};
const snapshotTwin = ${JSON.stringify(snapshotTwin)};
const drilldownTwin = ${JSON.stringify(drilldownTwin)};
const snapshotAmbiguous = ${JSON.stringify(snapshotAmbiguous)};
const drilldownAmbiguous = ${JSON.stringify(drilldownAmbiguous)};
const snapshotConnect = ${JSON.stringify(snapshotConnect)};
const drilldownConnect = ${JSON.stringify(drilldownConnect)};

function planCase({ snapshot, drilldown, targetPeerIp }) {
  const peer = snapshot.bgpPeers.find((item) => item.peerIp === targetPeerIp) ?? null;
  assert(peer, \`peer \${targetPeerIp} must exist in fixture\`);
  const dependencies = analyzeBgpPeerCleanupDependencies({ targetPeerIp, snapshot, drilldown });
  const twin = findTwinPeer({ snapshot, targetPeer: peer });
  const classification = classifyBgpPeerCleanup({ peer, twin, dependencies });
  const analysis = buildBgpPeerCleanupAnalysis({
    deviceId: 1,
    peer,
    snapshot,
    drilldown,
    dependencies,
    twin,
    recommendation: classification.recommendation,
    riskLevel: classification.riskLevel,
    blockedReasons: classification.blockedReasons,
    warnings: [],
  });
  analysis.script = buildBgpPeerCleanupScript({ analysis });
  return { peer, dependencies, twin, classification, analysis };
}

function dependencyNames(list) {
  return list.map((item) => \`\${item.type}:\${item.name}\`);
}

const exclusivePlan = planCase({ snapshot: snapshotExclusive, drilldown: drilldownExclusive, targetPeerIp: "172.28.0.14" });
assert.equal(exclusivePlan.classification.recommendation, "full");
assert.equal(exclusivePlan.classification.riskLevel, "low");
assert.equal(exclusivePlan.classification.blockedReasons.length, 0);
assert.ok(exclusivePlan.dependencies.exclusive.length > 0);
assert.ok(dependencyNames(exclusivePlan.dependencies.exclusive).includes("route-policy:XPAND-CDN-IN"));
assert.ok(exclusivePlan.analysis.script.removalCommands.some((line) => line.includes("undo route-policy XPAND-CDN-IN")));

const sharedPlan = planCase({ snapshot: snapshotShared, drilldown: drilldownShared, targetPeerIp: "45.169.161.138" });
assert.equal(sharedPlan.classification.recommendation, "partial");
assert.equal(sharedPlan.classification.riskLevel, "medium");
assert.ok(sharedPlan.dependencies.shared.length > 0);
assert.ok(sharedPlan.analysis.script.removalCommands.every((line) => !line.includes("C15-EXPORT")));
assert.ok(sharedPlan.analysis.script.removalCommands.every((line) => !line.includes("C15-SHARED-PFX")));

const ambiguousPlan = planCase({ snapshot: snapshotAmbiguous, drilldown: drilldownAmbiguous, targetPeerIp: "172.28.1.22" });
assert.equal(ambiguousPlan.classification.recommendation, "skip");
assert.equal(ambiguousPlan.classification.riskLevel, "high");
assert.ok(ambiguousPlan.classification.blockedReasons.some((reason) => reason.includes("Dependência ambígua")));
assert.ok(ambiguousPlan.dependencies.ambiguous.length > 0);

const twinPlan = planCase({ snapshot: snapshotTwin, drilldown: drilldownTwin, targetPeerIp: "10.20.255.10" });
assert.equal(twinPlan.classification.recommendation, "skip");
assert.equal(twinPlan.classification.riskLevel, "high");
assert.ok(twinPlan.classification.blockedReasons.includes("Twin AF ainda ativo"));
assert.equal(twinPlan.twin?.peerIp, "10.20.255.11");
assert.equal(twinPlan.twin?.state, "Established");

const connectPlan = planCase({ snapshot: snapshotConnect, drilldown: drilldownConnect, targetPeerIp: "10.20.0.30" });
assert.equal(connectPlan.classification.recommendation, "partial");
assert.equal(connectPlan.classification.riskLevel, "medium");
assert.equal(connectPlan.classification.blockedReasons.length, 0);

assert.ok(exclusivePlan.analysis.script.validationBefore.length > 0);
assert.ok(exclusivePlan.analysis.script.validationAfter.length > 0);
assert.ok(exclusivePlan.analysis.script.validationBefore.some((cmd) => cmd.includes("display current-configuration | begin bgp")));
assert.ok(exclusivePlan.analysis.script.validationAfter.some((cmd) => cmd.includes("display bgp vpnv4 vpn-instance XPAND-CDN peer 172.28.0.14 verbose")));

const sanitizedAnalysis = buildBgpPeerCleanupAnalysis({
  deviceId: 1,
  peer: { ...snapshotExclusive.bgpPeers[0], description: "TOKEN-SECRET-123" },
  snapshot: snapshotExclusive,
  drilldown: drilldownExclusive,
  dependencies: exclusivePlan.dependencies,
  twin: null,
  recommendation: "full",
  riskLevel: "low",
  blockedReasons: [],
  warnings: [],
});
const markdown = buildBgpPeerCleanupMarkdown({ analysis: sanitizedAnalysis });
assert.ok(!markdown.includes("TOKEN-SECRET-123"), "evidence must not leak peer description");
assert.ok(!markdown.includes("passwordEncrypted"), "evidence must not leak secrets");

const serviceSource = readFileSync(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/bgp-drill-cleanup/bgp-drill-cleanup.service.ts"), "utf8");
const routeSource = readFileSync(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/bgp-drill-cleanup/bgp-drill-cleanup.routes.ts"), "utf8");
assert.ok(serviceSource.includes("bgp_cleanup_analysis_created"));
assert.ok(serviceSource.includes("bgp_cleanup_script_exported"));
assert.ok(!serviceSource.includes("ssh2"), "service must stay read-only");
assert.ok(!serviceSource.includes("rollback"), "service must not execute rollback");
assert.ok(!serviceSource.includes("system-view"), "service must not execute config commands");
assert.ok(routeSource.includes('requirePermission("bgp.read")'));
assert.ok(routeSource.includes('requirePermission("bgp.cleanup.plan")'));
assert.ok(!routeSource.includes("bgp.cleanup.apply"));

console.log("bgp-peer-cleanup-planner selftest passed");
})();
`;

runTsx(code);

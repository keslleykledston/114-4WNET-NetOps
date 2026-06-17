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
  makeDependency("community-filter", "GLOBAL-EXPORT-UPSTREAM-P3"),
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
  communities: [{
    name: "XPAND-CDN-CF",
    entries: [{ line: "ip community-filter advanced XPAND-CDN-CF index 10 permit 64777:51003" }],
    source: "ssh_running_config",
    confidence: "high",
  }],
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

const snapshotGlobal = makeSnapshot({
  peers: [
    makePeer({
      peerIp: "10.20.255.2",
      vrf: null,
      addressFamily: "ipv4",
      state: "Connect",
      remoteAs: 268707,
      name: "GLOBAL-PEER",
      description: "GLOBAL-PEER",
      importPolicy: "ASAS271697-R-S-ROSA-Import-V4",
      exportPolicy: "ASAS271697-R-S-ROSA-Export-V4",
    }),
  ],
  policies: [
    makeRoutePolicy("ASAS271697-R-S-ROSA-Import-V4", [makeDependency("ip-prefix", "AS271697-R-S-ROSA")]),
    makeRoutePolicy("ASAS271697-R-S-ROSA-Export-V4", []),
  ],
  prefixLists: [{ name: "AS271697-R-S-ROSA", entries: [], source: "ssh_running_config", confidence: "high" }],
});

const drilldownGlobal = {
  contractVersion: "bgp-peer-drilldown-v1",
  deviceId: 1,
  peer: "10.20.255.2",
  source: "ssh_detail",
  collectedAt: "2026-06-04T00:00:01.000Z",
  configBuildSource: "snapshot_aggregate",
  snapshotId: 15,
  root: {
    peer: "10.20.255.2",
    asNumber: 268707,
    description: "GLOBAL-PEER",
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
      vrf: null,
      direction: "import",
      policyName: "ASAS271697-R-S-ROSA-Import-V4",
      source: "peer",
      inheritedFromGroup: false,
      inheritedGroup: null,
      status: "FOUND",
    },
    {
      afiSafi: "ipv4_unicast",
      vrf: null,
      direction: "export",
      policyName: "ASAS271697-R-S-ROSA-Export-V4",
      source: "peer",
      inheritedFromGroup: false,
      inheritedGroup: null,
      status: "FOUND",
    },
  ],
  policies: [
    makeDrilldownPolicy("ASAS271697-R-S-ROSA-Import-V4", "import", "ipv4_unicast", [makeDependency("ip-prefix", "AS271697-R-S-ROSA")]),
    makeDrilldownPolicy("ASAS271697-R-S-ROSA-Export-V4", "export", "ipv4_unicast", []),
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

const snapshotHotfix = makeSnapshot({
  peers: [
    makePeer({
      peerIp: "172.22.151.22",
      vrf: "MS-FIBRA",
      addressFamily: "ipv4",
      state: "Active",
      remoteAs: 268707,
      name: "MS-FIBRA",
      description: "MS-FIBRA",
      importPolicy: "AS270966-MS-FIBRA-Import",
      exportPolicy: "AS270966-MS-FIBRA-Export",
    }),
    makePeer({
      peerIp: "172.22.151.23",
      vrf: "MS-FIBRA",
      addressFamily: "ipv4",
      state: "Established",
      remoteAs: 268707,
      name: "MS-FIBRA-2",
      description: "MS-FIBRA-2",
      importPolicy: "SHARED-MS-FIBRA-IN",
      exportPolicy: null,
    }),
  ],
  policies: [
    makeRoutePolicy("AS270966-MS-FIBRA-Import", [
      makeDependency("ip-prefix", "AS270966-MS-FIBRA"),
      makeDependency("community-filter", "C07-RECEIVED"),
    ]),
    makeRoutePolicy("AS270966-MS-FIBRA-Export", []),
    makeRoutePolicy("SHARED-MS-FIBRA-IN", [makeDependency("ip-prefix", "AS270966-MS-FIBRA")]),
  ],
  prefixLists: [{ name: "AS270966-MS-FIBRA", entries: [], source: "ssh_running_config", confidence: "high" }],
  communities: [{
    name: "C07-RECEIVED",
    entries: [{ line: "ip community-filter basic C07-RECEIVED index 10 permit 64777:51003" }],
    source: "ssh_running_config",
    confidence: "high",
  }],
});

const drilldownHotfix = {
  contractVersion: "bgp-peer-drilldown-v1",
  deviceId: 1,
  peer: "172.22.151.22",
  source: "ssh_detail",
  collectedAt: "2026-06-04T00:00:01.000Z",
  configBuildSource: "snapshot_aggregate",
  snapshotId: 18,
  root: {
    peer: "172.22.151.22",
    asNumber: 268707,
    description: "MS-FIBRA",
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
      vrf: "MS-FIBRA",
      direction: "import",
      policyName: "AS270966-MS-FIBRA-Import",
      source: "peer",
      inheritedFromGroup: false,
      inheritedGroup: null,
      status: "FOUND",
    },
    {
      afiSafi: "ipv4_unicast",
      vrf: "MS-FIBRA",
      direction: "export",
      policyName: "AS270966-MS-FIBRA-Export",
      source: "peer",
      inheritedFromGroup: false,
      inheritedGroup: null,
      status: "FOUND",
    },
  ],
  policies: [
    makeDrilldownPolicy("AS270966-MS-FIBRA-Import", "import", "ipv4_unicast", [
      makeDependency("ip-prefix", "AS270966-MS-FIBRA"),
      makeDependency("community-filter", "C07-RECEIVED"),
    ]),
    makeDrilldownPolicy("AS270966-MS-FIBRA-Export", "export", "ipv4_unicast", []),
    makeDrilldownPolicy("SHARED-MS-FIBRA-IN", "import", "ipv4_unicast", [makeDependency("ip-prefix", "AS270966-MS-FIBRA")]),
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

const snapshotIpv6Exclusive = makeSnapshot({
  peers: [
    makePeer({
      peerIp: "2001:db8::10",
      vrf: null,
      addressFamily: "ipv6",
      state: "Active",
      remoteAs: 268707,
      name: "IPV6-PEER",
      description: "IPV6-PEER",
      importPolicy: "IPV6-ONLY-IN",
      exportPolicy: null,
    }),
  ],
  policies: [
    makeRoutePolicy("IPV6-ONLY-IN", [makeDependency("ipv6-prefix", "IPV6-ONLY-PFX")]),
  ],
  ipv6PrefixLists: [{ name: "IPV6-ONLY-PFX", entries: [], source: "ssh_running_config", confidence: "high" }],
});

const drilldownIpv6Exclusive = {
  contractVersion: "bgp-peer-drilldown-v1",
  deviceId: 1,
  peer: "2001:db8::10",
  source: "ssh_detail",
  collectedAt: "2026-06-04T00:00:01.000Z",
  configBuildSource: "snapshot_aggregate",
  snapshotId: 17,
  root: {
    peer: "2001:db8::10",
    asNumber: 268707,
    description: "IPV6-PEER",
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
      vrf: null,
      direction: "import",
      policyName: "IPV6-ONLY-IN",
      source: "peer",
      inheritedFromGroup: false,
      inheritedGroup: null,
      status: "FOUND",
    },
  ],
  policies: [
    makeDrilldownPolicy("IPV6-ONLY-IN", "import", "ipv6_unicast", [makeDependency("ipv6-prefix", "IPV6-ONLY-PFX")]),
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

const libraryGlobalDeps = [
  makeDependency("community-filter", "DEFAULT"),
  makeDependency("community-filter", "FULL-ROUTE-ALL"),
  makeDependency("community-filter", "GLOBAL-EXPORT-UPSTREAM-P3"),
  makeDependency("community-filter", "C07-RECEIVED"),
];

const snapshotLibraryGlobals = makeSnapshot({
  peers: [
    makePeer({
      peerIp: "10.0.0.50",
      vrf: "CDN",
      addressFamily: "ipv4",
      state: "Active",
      remoteAs: 65050,
      name: "LIB-PEER",
      description: "LIB-PEER",
      importPolicy: "CUSTOMER-LIB-IN",
      exportPolicy: null,
    }),
  ],
  policies: [
    makeRoutePolicy("CUSTOMER-LIB-IN", libraryGlobalDeps),
  ],
});

const drilldownLibraryGlobals = {
  contractVersion: "bgp-peer-drilldown-v1",
  deviceId: 1,
  peer: "10.0.0.50",
  source: "ssh_detail",
  collectedAt: "2026-06-04T00:00:01.000Z",
  configBuildSource: "snapshot_aggregate",
  snapshotId: 16,
  root: {
    peer: "10.0.0.50",
    asNumber: 65050,
    description: "LIB-PEER",
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
      policyName: "CUSTOMER-LIB-IN",
      source: "peer",
      inheritedFromGroup: false,
      inheritedGroup: null,
      status: "FOUND",
    },
  ],
  policies: [
    makeDrilldownPolicy("CUSTOMER-LIB-IN", "import", "ipv4_unicast", libraryGlobalDeps),
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
const { buildBgpPeerCleanupAnalysis, buildSnapshotFromLiveBgpConfig, classifyBgpPeerCleanup, peerFromSnapshot } = await import(${JSON.stringify(pathToFileURL(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/bgp-drill-cleanup/bgp-drill-cleanup.service.ts")).href)});
const { resolveLocalAsForCleanup, localAsFromSnapshot, parseLocalAsFromBgpConfigText } = await import(${JSON.stringify(pathToFileURL(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/bgp-drill-cleanup/bgp-drill-cleanup.local-as.ts")).href)});
const { buildChangePlanInputFromBgpCleanup } = await import(${JSON.stringify(pathToFileURL(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/change-plans/adapters/bgp-cleanup.adapter.ts")).href)});
const { buildBgpPeerDrilldownResult } = await import(${JSON.stringify(pathToFileURL(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown.builder.ts")).href)});

const snapshotExclusive = ${JSON.stringify(snapshotExclusive)};
const drilldownExclusive = ${JSON.stringify(drilldownExclusive)};
const snapshotShared = ${JSON.stringify(snapshotShared)};
const drilldownShared = ${JSON.stringify(drilldownShared)};
const snapshotTwin = ${JSON.stringify(snapshotTwin)};
const drilldownTwin = ${JSON.stringify(drilldownTwin)};
const snapshotGlobal = ${JSON.stringify(snapshotGlobal)};
const drilldownGlobal = ${JSON.stringify(drilldownGlobal)};
const snapshotHotfix = ${JSON.stringify(snapshotHotfix)};
const drilldownHotfix = ${JSON.stringify(drilldownHotfix)};
const snapshotIpv6Exclusive = ${JSON.stringify(snapshotIpv6Exclusive)};
const drilldownIpv6Exclusive = ${JSON.stringify(drilldownIpv6Exclusive)};
const snapshotAmbiguous = ${JSON.stringify(snapshotAmbiguous)};
const drilldownAmbiguous = ${JSON.stringify(drilldownAmbiguous)};
const snapshotConnect = ${JSON.stringify(snapshotConnect)};
const drilldownConnect = ${JSON.stringify(drilldownConnect)};
const snapshotLibraryGlobals = ${JSON.stringify(snapshotLibraryGlobals)};
const drilldownLibraryGlobals = ${JSON.stringify(drilldownLibraryGlobals)};

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

const fallbackDrilldown = buildBgpPeerDrilldownResult({
  deviceId: 1,
  peer: "172.28.0.14",
  snapshot: snapshotExclusive,
  rawConfig: "sysname fallback-without-bgp-root",
  collectedAt: new Date("2026-06-04T00:00:01.000Z"),
  snapshotId: null,
  query: { includePolicies: true, includePolicyObjects: true },
});
assert.ok(fallbackDrilldown.warnings.some((warning) => warning.includes("resolvido pelo snapshot BGP")));
assert.ok(fallbackDrilldown.effectivePolicies.some((policy) => policy.policyName === "XPAND-CDN-IN"));
assert.ok(fallbackDrilldown.dependencies.some((dep) => dep.dependencyType === "route-policy" && dep.dependencyName === "XPAND-CDN-IN"));
assert.ok(fallbackDrilldown.policies.some((policy) => policy.dependencies.some((dep) => dep.dependencyType === "ip-prefix" && dep.dependencyName === "XPAND-CDN-PFX")));

const exclusivePlan = planCase({ snapshot: snapshotExclusive, drilldown: drilldownExclusive, targetPeerIp: "172.28.0.14" });
exclusivePlan.analysis.localAs = 268707;
exclusivePlan.analysis.script = buildBgpPeerCleanupScript({ analysis: exclusivePlan.analysis });
assert.equal(exclusivePlan.classification.recommendation, "full");
assert.equal(exclusivePlan.classification.riskLevel, "low");
assert.equal(exclusivePlan.classification.blockedReasons.length, 0);
assert.ok(exclusivePlan.dependencies.exclusive.length > 0);
assert.ok(dependencyNames(exclusivePlan.dependencies.exclusive).includes("route-policy:XPAND-CDN-IN"));
assert.ok(exclusivePlan.analysis.script.removalCommands.includes("system-view"));
assert.ok(exclusivePlan.analysis.script.removalCommands.includes("bgp 268707"));
assert.ok(exclusivePlan.analysis.script.removalCommands.every((line) => !line.includes("bgp 64512")));
assert.ok(exclusivePlan.analysis.script.removalCommands.some((line) => line.includes("undo route-policy XPAND-CDN-IN")));
assert.ok(exclusivePlan.analysis.script.removalCommands.some((line) => line.includes("undo ip ip-prefix XPAND-CDN-PFX")));
assert.ok(exclusivePlan.analysis.script.removalCommands.includes("undo ip community-filter advanced XPAND-CDN-CF"));

const sharedPlan = planCase({ snapshot: snapshotShared, drilldown: drilldownShared, targetPeerIp: "45.169.161.138" });
assert.equal(sharedPlan.classification.recommendation, "partial");
assert.equal(sharedPlan.classification.riskLevel, "medium");
assert.ok(sharedPlan.dependencies.shared.length > 0);
assert.ok(sharedPlan.dependencies.global.some((dep) => dep.name === "GLOBAL-EXPORT-UPSTREAM-P3"));
assert.ok(!sharedPlan.dependencies.shared.some((dep) => dep.name === "GLOBAL-EXPORT-UPSTREAM-P3"));
assert.ok(sharedPlan.dependencies.global.every((dep) => dep.status === "global"));
assert.ok(sharedPlan.dependencies.global.every((dep) => !(dep.reason ?? "").includes("compartilhada")));
assert.ok(sharedPlan.analysis.script.removalCommands.every((line) => !line.includes("C15-EXPORT")));
assert.ok(sharedPlan.analysis.script.removalCommands.every((line) => !line.includes("C15-SHARED-PFX")));
assert.ok(sharedPlan.analysis.script.removalCommands.every((line) => !line.includes("GLOBAL-EXPORT-UPSTREAM-P3")));
assert.ok(sharedPlan.analysis.script.removalCommands.every((line) => !line.includes("DEFAULT")));
assert.ok(sharedPlan.analysis.script.removalCommands.every((line) => !line.includes("FULL-ROUTE-ALL")));

const libraryPlan = planCase({ snapshot: snapshotLibraryGlobals, drilldown: drilldownLibraryGlobals, targetPeerIp: "10.0.0.50" });
assert.ok(libraryPlan.dependencies.global.some((dep) => dep.name === "DEFAULT"));
assert.ok(libraryPlan.dependencies.global.some((dep) => dep.name === "FULL-ROUTE-ALL"));
assert.ok(libraryPlan.dependencies.global.some((dep) => dep.name === "C07-RECEIVED"));
assert.ok(libraryPlan.dependencies.global.every((dep) => dep.status === "global"));
assert.ok(libraryPlan.dependencies.global.every((dep) => !(dep.reason ?? "").includes("compartilhada")));
assert.ok(!libraryPlan.dependencies.shared.some((dep) => dep.name === "DEFAULT"));
assert.equal(libraryPlan.classification.recommendation, "full");
assert.ok(!libraryPlan.dependencies.shared.some((dep) => ["DEFAULT", "FULL-ROUTE-ALL", "C07-RECEIVED", "GLOBAL-EXPORT-UPSTREAM-P3"].includes(dep.name)));
assert.ok(buildBgpPeerCleanupMarkdown({ analysis: libraryPlan.analysis }).includes("## GLOBAIS / PRESERVADOS"));
assert.ok(libraryPlan.analysis.script.removalCommands.every((line) => !line.includes("DEFAULT")));
assert.ok(libraryPlan.analysis.script.removalCommands.every((line) => !line.includes("FULL-ROUTE-ALL")));
assert.ok(libraryPlan.analysis.script.removalCommands.every((line) => !line.includes("C07-RECEIVED")));

const globalPlan = planCase({ snapshot: snapshotGlobal, drilldown: drilldownGlobal, targetPeerIp: "10.20.255.2" });
globalPlan.analysis.localAs = 268707;
globalPlan.analysis.script = buildBgpPeerCleanupScript({ analysis: globalPlan.analysis });
assert.equal(globalPlan.classification.recommendation, "full");
assert.equal(globalPlan.classification.riskLevel, "low");
assert.ok(globalPlan.analysis.script.removalCommands.includes("undo peer 10.20.255.2"));
assert.ok(globalPlan.analysis.script.removalCommands.includes("y"));
assert.ok(globalPlan.analysis.script.removalCommands.every((line) => !line.includes("ipv4-family unicast")));
assert.ok(globalPlan.analysis.script.removalCommands.every((line) => !line.includes("ipv6-family unicast")));
assert.ok(globalPlan.analysis.script.removalCommands.indexOf("undo peer 10.20.255.2") < globalPlan.analysis.script.removalCommands.indexOf("y"));
assert.ok(globalPlan.analysis.script.removalCommands.indexOf("y") < globalPlan.analysis.script.removalCommands.indexOf("quit"));
assert.ok(globalPlan.analysis.script.removalCommands.indexOf("quit") < globalPlan.analysis.script.removalCommands.indexOf("undo route-policy ASAS271697-R-S-ROSA-Import-V4"));
assert.ok(globalPlan.analysis.script.removalCommands.some((line) => line === "undo route-policy ASAS271697-R-S-ROSA-Import-V4"));
assert.ok(globalPlan.analysis.script.removalCommands.some((line) => line === "undo route-policy ASAS271697-R-S-ROSA-Export-V4"));
assert.ok(globalPlan.analysis.script.removalCommands.some((line) => line === "undo ip ip-prefix AS271697-R-S-ROSA"));
assert.ok(globalPlan.analysis.script.removalCommands.indexOf("undo route-policy ASAS271697-R-S-ROSA-Import-V4") < globalPlan.analysis.script.removalCommands.indexOf("undo ip ip-prefix AS271697-R-S-ROSA"));
assert.ok(globalPlan.analysis.script.removalCommands.at(-1) === "commit");

const hotfixPlan = planCase({ snapshot: snapshotHotfix, drilldown: drilldownHotfix, targetPeerIp: "172.22.151.22" });
hotfixPlan.analysis.localAs = 268707;
hotfixPlan.analysis.script = buildBgpPeerCleanupScript({ analysis: hotfixPlan.analysis });
assert.equal(hotfixPlan.classification.recommendation, "partial");
assert.ok(hotfixPlan.dependencies.exclusive.some((dep) => dep.type === "route-policy" && dep.name === "AS270966-MS-FIBRA-Import"));
assert.ok(hotfixPlan.dependencies.exclusive.some((dep) => dep.type === "route-policy" && dep.name === "AS270966-MS-FIBRA-Export"));
assert.ok(hotfixPlan.dependencies.shared.some((dep) => dep.type === "ip-prefix" && dep.name === "AS270966-MS-FIBRA"));
assert.ok(hotfixPlan.dependencies.global.some((dep) => dep.type === "community-filter" && dep.name === "C07-RECEIVED"));
assert.ok(hotfixPlan.analysis.script.removalCommands.includes("undo peer 172.22.151.22"));
assert.ok(hotfixPlan.analysis.script.removalCommands.includes("undo route-policy AS270966-MS-FIBRA-Import"));
assert.ok(hotfixPlan.analysis.script.removalCommands.includes("undo route-policy AS270966-MS-FIBRA-Export"));
assert.ok(!hotfixPlan.analysis.script.removalCommands.includes("undo ip ip-prefix AS270966-MS-FIBRA"));
assert.ok(!hotfixPlan.analysis.script.removalCommands.includes("undo ip ip-prefix DEFAULT"));
assert.ok(!hotfixPlan.analysis.script.removalCommands.includes("undo ip community-filter C07-RECEIVED"));
assert.ok(hotfixPlan.analysis.script.validationBefore.some((cmd) => cmd.includes("AS270966-MS-FIBRA-Import")));
assert.ok(hotfixPlan.analysis.script.validationBefore.some((cmd) => cmd.includes("AS270966-MS-FIBRA-Export")));
assert.ok(hotfixPlan.analysis.script.validationAfter.some((cmd) => cmd.includes("AS270966-MS-FIBRA-Import")));
assert.ok(hotfixPlan.analysis.script.validationAfter.some((cmd) => cmd.includes("AS270966-MS-FIBRA-Export")));
const hotfixChangePlan = buildChangePlanInputFromBgpCleanup({
  analysis: hotfixPlan.analysis,
  peer: hotfixPlan.peer,
  snapshot: snapshotHotfix,
  drilldown: drilldownHotfix,
  sourceAnalysisId: 1,
});
assert.ok(hotfixChangePlan.items.some((item) => item.itemType === "route-policy" && item.itemName === "AS270966-MS-FIBRA-Import" && item.willBeRemoved === true));
assert.ok(hotfixChangePlan.items.some((item) => item.itemType === "route-policy" && item.itemName === "AS270966-MS-FIBRA-Export" && item.willBeRemoved === true));
assert.ok(hotfixChangePlan.items.some((item) => item.itemType === "ip-prefix" && item.itemName === "AS270966-MS-FIBRA" && item.willBeRemoved === false));
assert.ok(hotfixChangePlan.items.some((item) => item.itemType === "community-filter" && item.itemName === "C07-RECEIVED" && item.classification === "global"));

const ipv6ExclusivePlan = planCase({ snapshot: snapshotIpv6Exclusive, drilldown: drilldownIpv6Exclusive, targetPeerIp: "2001:db8::10" });
ipv6ExclusivePlan.analysis.localAs = 268707;
ipv6ExclusivePlan.analysis.script = buildBgpPeerCleanupScript({ analysis: ipv6ExclusivePlan.analysis });
assert.equal(ipv6ExclusivePlan.classification.recommendation, "full");
assert.equal(ipv6ExclusivePlan.classification.riskLevel, "low");
assert.ok(ipv6ExclusivePlan.analysis.script.removalCommands.includes("undo ip ipv6-prefix IPV6-ONLY-PFX"));
assert.ok(ipv6ExclusivePlan.analysis.script.removalCommands.indexOf("undo route-policy IPV6-ONLY-IN") < ipv6ExclusivePlan.analysis.script.removalCommands.indexOf("undo ip ipv6-prefix IPV6-ONLY-PFX"));
assert.ok(ipv6ExclusivePlan.analysis.script.removalCommands.indexOf("undo peer 2001:db8::10") < ipv6ExclusivePlan.analysis.script.removalCommands.indexOf("y"));

const ambiguousPlan = planCase({ snapshot: snapshotAmbiguous, drilldown: drilldownAmbiguous, targetPeerIp: "172.28.1.22" });
assert.equal(ambiguousPlan.classification.recommendation, "skip");
assert.equal(ambiguousPlan.classification.riskLevel, "high");
assert.ok(ambiguousPlan.classification.blockedReasons.some((reason) => reason.includes("Dependência ambígua")));
assert.ok(ambiguousPlan.dependencies.ambiguous.length > 0);

const twinPlan = planCase({ snapshot: snapshotTwin, drilldown: drilldownTwin, targetPeerIp: "10.20.255.10" });
assert.notEqual(twinPlan.classification.recommendation, "skip");
assert.equal(twinPlan.classification.blockedReasons.length, 0);
assert.equal(twinPlan.twin?.peerIp, "10.20.255.11");
assert.equal(twinPlan.twin?.state, "Established");
twinPlan.analysis.script = buildBgpPeerCleanupScript({ analysis: twinPlan.analysis });
assert.ok(twinPlan.analysis.script.removalCommands.every((line) => !line.includes("10.20.255.11")));

const connectPlan = planCase({ snapshot: snapshotConnect, drilldown: drilldownConnect, targetPeerIp: "10.20.0.30" });
assert.equal(connectPlan.classification.recommendation, "partial");
assert.equal(connectPlan.classification.riskLevel, "medium");
assert.equal(connectPlan.classification.blockedReasons.length, 0);

assert.ok(exclusivePlan.analysis.script.validationBefore.length > 0);
assert.ok(exclusivePlan.analysis.script.validationAfter.length > 0);
assert.ok(exclusivePlan.analysis.script.validationBefore.some((cmd) => cmd.includes("display current-configuration | begin bgp")));
assert.ok(exclusivePlan.analysis.script.validationAfter.some((cmd) => cmd.includes("display bgp vpnv4 vpn-instance XPAND-CDN peer 172.28.0.14 verbose")));

assert.equal(parseLocalAsFromBgpConfigText("bgp 268707\\n peer 10.0.0.1 as-number 65001"), 268707);
const vrfOnlySnapshot = {
  ...snapshotExclusive,
  parsed_config: { catalogs: {} },
  vrfs: [{ name: "CDN", rd: "268707:85", exists: true, source: "ssh_live", confidence: "high", evidence: "ip vpn-instance CDN" }],
};
assert.equal(localAsFromSnapshot(vrfOnlySnapshot), 268707);
const resolvedFromVrf = await resolveLocalAsForCleanup({
  deviceId: 2,
  snapshot: vrfOnlySnapshot,
  collectedConfigLookup: async () => null,
});
assert.equal(resolvedFromVrf.localAs, 268707);
assert.equal(resolvedFromVrf.source, "snapshot_vrf_rd");
const resolvedFromCollected = await resolveLocalAsForCleanup({
  deviceId: 2,
  snapshot: { ...vrfOnlySnapshot, vrfs: [] },
  collectedConfigLookup: async () => 268707,
});
assert.equal(resolvedFromCollected.localAs, 268707);
assert.equal(resolvedFromCollected.source, "collected_config");
const cdnRemovalScript = buildBgpPeerCleanupScript({
  analysis: {
    ...exclusivePlan.analysis,
    peerIp: "104.234.244.190",
    vrf: "CDN",
    localAs: 268707,
  },
});
assert.deepEqual(cdnRemovalScript.removalCommands.slice(0, 4), [
  "system-view",
  "bgp 268707",
  "ipv4-family vpn-instance CDN",
  "undo peer 104.234.244.190",
]);

const operationalOnlyPeer = {
  peerIp: "104.234.244.190",
  vrf: "CDN",
  addressFamily: "ipv4",
  state: "Connect",
  remoteAs: 11344,
  role: "cdn",
  category: "cdn",
  description: "C16-GGC-IeII-IPV4",
  name: "C16-GGC-IeII-IPV4",
  source: "ssh_live",
  confidence: "high",
  evidence: "display bgp peer 104.234.244.190",
  importPolicy: null,
  exportPolicy: null,
  sessionType: "eBGP",
  uptime: null,
  receivedPrefixes: null,
  advertisedPrefixes: null,
  activePrefixes: null,
  primaryDirection: "export",
  largeReceivedRoutes: false,
  largeAdvertisedRoutes: false,
  autoLoadRoutes: false,
  requiresExplicitRouteSearch: false,
};
const liveBgpConfigWithoutPeer = [
  "bgp 268707",
  " peer 172.28.0.5 as-number 263934",
  " ipv4-family vpn-instance CDN",
  "  peer 172.28.0.5 enable",
  "  peer 172.28.0.5 route-policy AS263934-INFORR-CDN-Import-V4 import",
].join("\\n");
const refreshedSnapshot = buildSnapshotFromLiveBgpConfig({
  deviceId: 2,
  baseSnapshot: {
    ...snapshotExclusive,
    bgpPeers: [operationalOnlyPeer],
    vrfs: [{ name: "CDN", rd: "268707:85", exists: true, source: "ssh_live", confidence: "high", evidence: "ip vpn-instance CDN" }],
  },
  rawBgpConfig: liveBgpConfigWithoutPeer,
  startedAt: "2026-06-09T00:00:00.000Z",
  finishedAt: "2026-06-09T00:00:01.000Z",
  targetPeerIp: "104.234.244.190",
});
assert.ok(peerFromSnapshot(refreshedSnapshot, "104.234.244.190"), "operational peer must survive live BGP refresh");
assert.ok(
  refreshedSnapshot.warnings.some((warning) => warning.message.includes("104.234.244.190")),
  "refresh must warn when target peer is missing from live BGP config",
);

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

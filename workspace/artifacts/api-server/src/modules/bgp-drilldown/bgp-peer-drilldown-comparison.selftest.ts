import assert from "node:assert/strict";
import type { BgpPeerDrilldownResult } from "./bgp-peer-drilldown.types.js";
import { compareBgpPeerDrilldownSnapshots } from "./bgp-peer-drilldown-comparison.js";

function base(peer: string): BgpPeerDrilldownResult {
  return {
    contractVersion: "bgp-peer-drilldown-v1",
    deviceId: 1,
    peer,
    source: "ssh_full_config",
    collectedAt: "2026-05-26T10:00:00.000Z",
    configBuildSource: "raw_config",
    snapshotId: 1,
    root: {
      peer,
      asNumber: 262663,
      description: null,
      group: null,
      connectInterface: null,
      timers: null,
      passwordPresent: false,
      source: "ssh_full_config",
      status: "FOUND",
    },
    families: [{
      afiSafi: "ipv4_unicast",
      vrf: null,
      enabled: true,
      importPolicy: "POL-A",
      exportPolicy: "POL-B",
      defaultRouteAdvertise: false,
      nextHopLocal: false,
      advertiseCommunity: false,
      advertiseExtCommunity: false,
      reflectClient: false,
      keepAllRoutes: null,
      filterPolicy: null,
      asPathFilter: null,
      ipPrefixFilter: null,
      inheritedFromGroup: false,
      inheritedGroup: null,
      effectiveImportPolicy: "POL-A",
      effectiveExportPolicy: "POL-B",
      effectiveNextHopLocal: false,
      effectiveAdvertiseCommunity: false,
      effectiveAdvertiseExtCommunity: false,
      effectivePolicySource: "peer",
      source: "ssh_full_config",
    }],
    effectivePolicies: [],
    policies: [],
    dependencies: [],
    runtime: null,
    routeTables: {
      received: { requested: false, available: false, prefixCount: null },
      accepted: { requested: false, available: false, prefixCount: null },
      advertised: { requested: false, available: false, prefixCount: null },
    },
    warnings: ["w1"],
    rawEvidenceRefs: [],
  };
}

const left = base("172.28.1.138");
const right = {
  ...base("172.28.1.138"),
  collectedAt: "2026-05-26T11:00:00.000Z",
  families: [{
    ...base("172.28.1.138").families[0],
    effectiveImportPolicy: "POL-C",
    enabled: false,
  }],
  warnings: ["w1", "w2"],
};

const diff = compareBgpPeerDrilldownSnapshots(10, 11, left, right);
assert.equal(diff.importPolicyChanges.length, 1);
assert.equal(diff.importPolicyChanges[0]?.left, "POL-A");
assert.equal(diff.importPolicyChanges[0]?.right, "POL-C");
assert.equal(diff.enabledFamilyChanges.length, 1);
assert.deepEqual(diff.warningsAdded, ["w2"]);
assert.deepEqual(diff.warningsRemoved, []);

console.log("BGP drilldown D6 comparison selftest PASS");

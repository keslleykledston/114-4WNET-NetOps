import assert from "node:assert/strict";

import {
  buildConfigGeneratorDiffFromPreview,
  prepareConfigGeneratorDiffArtifacts,
  type ConfigGeneratorDiffBaselineState,
} from "./config-generator-diff.service.js";
import { sanitizeRenderedConfig } from "./config-generator.engine.js";
import type { ConfigGeneratorBlockOutput } from "./config-generator.types.js";

const preview: ConfigGeneratorBlockOutput = {
  renderedConfig: [
    "ip ip-prefix RFC5735",
    "route-policy BGP_BASELINE",
    "interface Eth-Trunk1.1234",
    "peer 10.0.0.2 as-number 65002",
    "peer 10.0.0.3 as-number 65001",
    "route-policy NEW_POLICY",
  ].join("\n"),
  postcheckCommands: "display bgp peer 10.0.0.2",
  rollbackPlaceholder: "rollback manual",
  blocks: [
    {
      key: "global_dependencies",
      title: "Global deps",
      classification: "global",
      status: "missing",
      content: [
        "[GLOBAL / já existente] ip ip-prefix RFC5735",
        "[GLOBAL / ausente] route-policy BASELINE",
      ].join("\n"),
    },
    {
      key: "circuit_dependencies",
      title: "Circuit deps",
      classification: "circuit",
      status: "new",
      content: [
        "interface Eth-Trunk1.1234",
        "route-policy BGP_BASELINE",
        "peer 10.0.0.2 as-number 65002",
        "peer 10.0.0.3 as-number 65001",
        "route-policy NEW_POLICY",
      ].join("\n"),
    },
    {
      key: "route_policy_import",
      title: "Route-policy import",
      classification: "circuit",
      status: "new",
      content: "route-policy BGP_BASELINE",
    },
    {
      key: "route_policy_export",
      title: "Route-policy export",
      classification: "circuit",
      status: "new",
      content: "route-policy NEW_POLICY",
    },
    {
      key: "peer_binding",
      title: "Peer binding",
      classification: "circuit",
      status: "new",
      content: [
        "peer 10.0.0.2 as-number 65002",
        "peer 10.0.0.3 as-number 65001",
      ].join("\n"),
    },
    {
      key: "postcheck",
      title: "Postcheck",
      classification: "circuit",
      status: "manual",
      content: "display bgp peer 10.0.0.2",
    },
    {
      key: "rollback_placeholder",
      title: "Rollback",
      classification: "circuit",
      status: "manual",
      content: "rollback manual",
    },
  ],
};

const baseline: ConfigGeneratorDiffBaselineState = {
  source: "collected_configs",
  rawConfig: "ip ip-prefix RFC5735\ninterface Eth-Trunk1.1234\nroute-policy BGP_BASELINE\n",
  collectedAt: "2026-01-01T00:00:00.000Z",
  checksum: "baseline-checksum",
  lines: ["ip ip-prefix RFC5735", "interface Eth-Trunk1.1234", "route-policy BGP_BASELINE"],
  semantic: {
    routePolicies: new Map([
      ["bgp_baseline", "BGP_BASELINE"],
      ["shared_policy", "SHARED_POLICY"],
    ]),
    prefixLists: new Map([["rfc5735", "RFC5735"]]),
    communityFilters: new Map([["baseline_comm", "BASELINE_COMM"]]),
    asPathFilters: new Set(),
    interfaces: new Map([["eth-trunk1.1234", "Eth-Trunk1.1234"]]),
    vlans: new Map([
      [1234, "1234"],
      [200, "200"],
    ]),
    peers: new Map([
      ["10.0.0.2", { asn: 65001, importPolicy: "BGP_BASELINE", exportPolicy: null }],
      ["10.0.0.3", { asn: null, importPolicy: null, exportPolicy: null }],
    ]),
    bgpLocalAsn: 273309,
    l2vcs: new Map(),
    vsis: new Map(),
    subinterfaces: new Map(),
  },
};

const diff = buildConfigGeneratorDiffFromPreview(preview, baseline);
assert.equal(diff.blocking, true);
assert.equal(diff.summary.globalExisting > 0, true);
assert.equal(diff.summary.globalMissing > 0, true);
assert.equal(diff.summary.conflicts > 0, true);
assert.equal(diff.diffBlocks.some((block) => block.items.some((item) => item.status === "already_present")), true);
assert.equal(diff.diffBlocks.some((block) => block.status === "conflict"), true);
assert.equal(diff.diffBlocks.some((block) => block.items.some((item) => item.status === "manual_review")), true);
assert.equal(diff.diffBlocks.some((block) => block.items.some((item) => item.status === "global_existing")), true);
assert.equal(diff.diffBlocks.some((block) => block.items.some((item) => item.status === "global_missing")), true);
assert.equal(diff.diffBlocks.some((block) => block.items.some((item) => item.status === "new_candidate")), true);

const noBaseline = buildConfigGeneratorDiffFromPreview(preview, {
  source: "none",
  rawConfig: null,
  collectedAt: null,
  checksum: null,
  lines: [],
  semantic: {
    routePolicies: new Map(),
    prefixLists: new Map(),
    communityFilters: new Map(),
    asPathFilters: new Set(),
    interfaces: new Map(),
    vlans: new Map(),
    peers: new Map(),
    bgpLocalAsn: null,
    l2vcs: new Map(),
    vsis: new Map(),
    subinterfaces: new Map(),
  },
});
assert.equal(noBaseline.summary.unknown > 0, true);
assert.equal(noBaseline.diffBlocks.some((block) => block.status === "unknown_no_baseline"), true);

const sanitized = sanitizeRenderedConfig("peer 10.0.0.2 password super-secret");
assert.equal(sanitized.includes("super-secret"), false);

const artifacts = prepareConfigGeneratorDiffArtifacts(
  {
    status: "ok",
    baseline: { source: "collected_configs", collectedAt: baseline.collectedAt, deviceId: 1, checksum: baseline.checksum },
    summary: diff.summary,
    blocks: diff.diffBlocks,
    blocking: diff.blocking,
    warnings: [],
    errors: [],
    renderedConfig: diff.summary.conflicts > 0 ? "candidate" : "",
    candidateChecksum: "candidate-checksum",
    baselineChecksum: baseline.checksum,
  },
  [],
);
assert.equal(artifacts.length, 2);
assert.equal(artifacts.every((item) => item.content.includes("candidate-checksum")), true);
assert.equal(prepareConfigGeneratorDiffArtifacts(
  {
    status: "ok",
    baseline: { source: "collected_configs", collectedAt: baseline.collectedAt, deviceId: 1, checksum: baseline.checksum },
    summary: diff.summary,
    blocks: diff.diffBlocks,
    blocking: diff.blocking,
    warnings: [],
    errors: [],
    renderedConfig: "candidate",
    candidateChecksum: "candidate-checksum",
    baselineChecksum: baseline.checksum,
  },
  ["precheck_diff", "semantic_diff"],
).length, 0);

console.log("config-generator.diff.selftest: OK");

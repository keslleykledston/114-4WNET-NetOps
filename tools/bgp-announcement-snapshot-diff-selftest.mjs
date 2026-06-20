#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { compareAnnouncementMatrixPayloads } = await import(path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.timeline-utils.ts"));

function makeRow(state, community, risk = "low") {
  return {
    targetPolicyName: "ORIGIN-DEMO",
    routePolicyName: "ORIGIN-DEMO",
    targetType: "origin_target",
    family: "ipv4",
    prefixScope: {
      type: "network",
      name: "ORIGIN-DEMO",
      expandedPrefixes: [{ index: null, action: "permit", prefix: "45.169.160.0/23", raw: "network 45.169.160.0 255.255.254.0 route-policy ORIGIN-DEMO" }],
      affectedPrefixCount: 1,
      shared: false,
    },
    affectedPrefixes: ["45.169.160.0/23"],
    source: "policy_graph_community_resolver",
    confidence: "high",
    matrixState: {},
    findings: [],
    riskLevel: risk,
    cells: {
      "10": {
        circuitId: "10",
        upstreamName: "C10",
        state,
        label: state,
        communities: community ? [community] : [],
        community,
        actionCode: community ? community.slice(-2) : null,
        communitySourceType: "direct",
        communitySourceName: null,
        note: null,
      },
    },
    risk,
    node: 10,
  };
}

const previous = {
  columns: [{ key: "10", label: "C10", upstreamCircuitId: "10", upstreamName: "C10" }],
  rows: [
    makeRow("On", "64777:51001", "low"),
    {
      ...makeRow("On", "64777:50101", "low"),
      targetPolicyName: "ORIGIN-KEEP",
      routePolicyName: "ORIGIN-KEEP",
      cells: {
        "10": { ...makeRow("On", "64777:50101").cells["10"], state: "On", label: "On" },
      },
    },
  ],
  generatedFrom: "policy_graph_community_resolver",
  featureStatus: "community_cells",
};

const current = {
  columns: [{ key: "10", label: "C10", upstreamCircuitId: "10", upstreamName: "C10" }],
  rows: [
    {
      ...makeRow("P2", "64777:51003", "medium"),
      findings: [{ code: "COMMUNITY_SET_EXACT_MATCH_FOUND", severity: "info", scope: "community_set", message: "ok" }],
    },
    {
      targetPolicyName: "ORIGIN-NEW",
      routePolicyName: "ORIGIN-NEW",
      targetType: "origin_target",
      family: "ipv4",
      prefixScope: {
        type: "network",
        name: "ORIGIN-NEW",
        expandedPrefixes: [{ index: null, action: "permit", prefix: "45.169.162.0/23", raw: "network 45.169.162.0 255.255.254.0 route-policy ORIGIN-NEW" }],
        affectedPrefixCount: 1,
        shared: false,
      },
      affectedPrefixes: ["45.169.162.0/23"],
      source: "policy_graph_community_resolver",
      confidence: "high",
      matrixState: {},
      findings: [{ code: "COMMUNITY_SET_EXACT_MATCH_FOUND", severity: "info", scope: "community_set", message: "ok" }],
      riskLevel: "low",
      cells: {},
      risk: "low",
      node: 10,
    },
  ],
  generatedFrom: "policy_graph_community_resolver",
  featureStatus: "community_cells",
};

const diff = compareAnnouncementMatrixPayloads(previous, current);
assert.equal(diff.summary?.added, 1);
assert.equal(diff.summary?.removed, 1);
assert.equal(diff.summary?.changed, 1);
assert.equal(diff.changed[0].cellChanges.some((cell) => cell.circuitId === "10"), true);
assert.equal(diff.changed[0].findingsAdded.includes("COMMUNITY_SET_EXACT_MATCH_FOUND"), true);
assert.equal(diff.changed[0].riskAfter, "medium");

console.log(JSON.stringify({
  ok: true,
  diff,
}, null, 2));
console.log("bgp-announcement-snapshot-diff-selftest: PASS");

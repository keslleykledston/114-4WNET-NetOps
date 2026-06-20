#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildAnnouncementGraph } = await import(path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.graph.service.ts",
));

const rawConfig = `
bgp 65000
 peer 192.0.2.1 as-number 65001
 peer 203.0.113.1 as-number 65002
 peer 10.0.0.1 as-number 65000
 ipv4-family unicast
  peer 192.0.2.1 route-policy AS1234-CLIENT-IMPORT import
  peer 192.0.2.1 route-policy AS1234-CLIENT-EXPORT export
  peer 203.0.113.1 route-policy C01-EXPORT export
  peer 203.0.113.1 route-policy C01-IMPORT-IPV4 import
  peer 10.0.0.1 route-policy MALHA-Export export
network 45.169.160.0 255.255.254.0 route-policy ORIGIN-X
network 2804:5984:8000:: 35 route-policy ORIGIN-V6
`;

const routePolicies = [
  {
    name: "ORIGIN-X",
    nodes: [{ sequence: 10, action: "permit", matches: [], applies: ["apply community 64777:50101"] }],
  },
  {
    name: "ORIGIN-V6",
    nodes: [{ sequence: 10, action: "permit", matches: [], applies: ["apply community 64777:51003"] }],
  },
  {
    name: "AS1234-CLIENT-IMPORT",
    nodes: [{ sequence: 10, action: "permit", matches: ["if-match ip-prefix CLIENT-IN"], applies: ["apply community 64777:50101"] }],
  },
  {
    name: "AS1234-CLIENT-EXPORT",
    nodes: [{ sequence: 10, action: "permit", matches: [], applies: ["apply community 64777:51001"] }],
  },
  {
    name: "C01-EXPORT",
    nodes: [{ sequence: 10, action: "permit", matches: [], applies: ["apply community 64777:51667"] }],
  },
  {
    name: "C01-IMPORT-IPV4",
    nodes: [{ sequence: 10, action: "permit", matches: [], applies: ["apply community 64777:51003"] }],
  },
  {
    name: "MALHA-Export",
    nodes: [{ sequence: 10, action: "permit", matches: [], applies: ["apply community 64777:51601"] }],
  },
  {
    name: "UNKNOWN-POLICY",
    nodes: [{ sequence: 10, action: "permit", matches: [], applies: [] }],
  },
];

const bgpPeers = [
  { peerIp: "192.0.2.1", name: "client-a", role: "customer", importPolicy: "AS1234-CLIENT-IMPORT", exportPolicy: "AS1234-CLIENT-EXPORT", addressFamily: "ipv4" },
  { peerIp: "203.0.113.1", name: "upstream-a", role: "provider", importPolicy: "C01-IMPORT-IPV4", exportPolicy: "C01-EXPORT", addressFamily: "ipv4" },
  { peerIp: "10.0.0.1", name: "mesh-a", role: "ibgp", importPolicy: null, exportPolicy: "MALHA-Export", addressFamily: "ipv4" },
];

const graph = buildAnnouncementGraph({ rawConfig, routePolicies, bgpPeers });
const classificationByPolicy = new Map(graph.classifications.map((item) => [item.policyName, item]));

assert.equal(classificationByPolicy.get("ORIGIN-X")?.policyType, "origin_target");
assert.equal(classificationByPolicy.get("ORIGIN-V6")?.policyType, "origin_target");
assert.equal(classificationByPolicy.get("AS1234-CLIENT-IMPORT")?.policyType, "customer_import_target");
assert.equal(classificationByPolicy.get("AS1234-CLIENT-EXPORT")?.policyType, "customer_export");
assert.equal(classificationByPolicy.get("C01-EXPORT")?.policyType, "upstream_export_audit");
assert.equal(classificationByPolicy.get("C01-IMPORT-IPV4")?.policyType, "upstream_import_audit");
assert.equal(classificationByPolicy.get("MALHA-Export")?.policyType, "internal_mesh");
assert.equal(classificationByPolicy.get("UNKNOWN-POLICY")?.policyType, "unknown");

assert.ok(graph.payload.rows.some((row) => row.targetPolicyName === "ORIGIN-X"));
assert.ok(graph.payload.rows.some((row) => row.targetPolicyName === "AS1234-CLIENT-IMPORT"));
assert.ok(!graph.payload.rows.some((row) => row.targetPolicyName === "AS1234-CLIENT-EXPORT"));
assert.ok(!graph.payload.rows.some((row) => row.targetPolicyName === "C01-EXPORT"));
assert.ok(!graph.payload.rows.some((row) => row.targetPolicyName === "C01-IMPORT-IPV4"));
assert.ok(!graph.payload.rows.some((row) => row.targetPolicyName === "MALHA-Export"));
assert.ok(!graph.payload.rows.some((row) => row.targetPolicyName === "UNKNOWN-POLICY"));
assert.equal(graph.payload.generatedFrom, "policy_graph_community_resolver");
assert.equal(graph.payload.featureStatus, "community_cells");
assert.ok(graph.payload.columns.length >= 3);
assert.equal(graph.payload.rows.find((row) => row.targetPolicyName === "ORIGIN-X")?.prefixScope.type, "network");
assert.equal(graph.payload.rows.find((row) => row.targetPolicyName === "AS1234-CLIENT-IMPORT")?.prefixScope.type, "ip_prefix");
assert.equal(graph.payload.rows.find((row) => row.targetPolicyName === "ORIGIN-X")?.cells["01"]?.label, "On");
assert.equal(graph.payload.rows.find((row) => row.targetPolicyName === "AS1234-CLIENT-IMPORT")?.cells["01"]?.label, "On");
assert.equal(graph.payload.rows.find((row) => row.targetPolicyName === "C01-EXPORT"), undefined);

assert.equal(graph.summary.totalOriginTargets, 2);
assert.equal(graph.summary.totalCustomerImportTargets, 1);
assert.equal(graph.summary.totalExcludedCustomerExports, 1);
assert.equal(graph.summary.totalExcludedUpstreamPolicies, 2);
assert.equal(graph.summary.totalExcludedInternalPolicies, 1);
assert.equal(graph.summary.totalUnknownPolicies, 1);
assert.ok((graph.summary.debugFindings ?? []).some((finding) => finding.code === "EXPORT_POLICY_EXCLUDED_FROM_ANNOUNCEMENT_MATRIX"));
assert.ok(graph.summary.totalCells > 0);

console.log(JSON.stringify({
  ok: true,
  rows: graph.payload.rows.map((row) => ({
    policy: row.targetPolicyName,
    type: row.targetType,
    family: row.family,
    prefixScope: row.prefixScope,
    cells: Object.fromEntries(Object.entries(row.cells).map(([circuitId, cell]) => [circuitId, { state: cell.state, label: cell.label, source: cell.communitySourceType }])),
  })),
  summary: graph.summary,
}, null, 2));
console.log("bgp-announcement-target-classification-selftest: PASS");

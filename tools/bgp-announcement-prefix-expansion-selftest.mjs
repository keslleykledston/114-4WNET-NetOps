#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { resolveAnnouncementMatrix } = await import(path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.matrix-resolver.ts",
));

const rawConfig = `
network 45.169.160.0 255.255.254.0 route-policy ORIGIN-V4
network 2804:5984:8000:: 35 route-policy ORIGIN-V6
route-policy CUST-V4 permit node 10
 if-match ip-prefix AS269485-GTA
route-policy CUST-RANGE permit node 10
 if-match ip-prefix AS269485-RANGE
route-policy CUST-V6 permit node 10
 if-match ipv6 address prefix-list AS266208-4WNET-V6-332
route-policy MISSING permit node 10
 if-match ip-prefix MISSING-LIST
ip ip-prefix AS269485-GTA index 10 permit 45.187.201.0 24
ip ip-prefix AS269485-RANGE index 10 permit 138.219.128.0 22 greater-equal 22 less-equal 24
ip ipv6-prefix AS266208-4WNET-V6-332 index 10 permit 2804:5984:8000:: 32 greater-equal 32 less-equal 48
`;

const routePolicies = [
  { name: "ORIGIN-V4", nodes: [{ sequence: 10, action: "permit", matches: [], applies: [] }] },
  { name: "ORIGIN-V6", nodes: [{ sequence: 10, action: "permit", matches: [], applies: [] }] },
  { name: "CUST-V4", nodes: [{ sequence: 10, action: "permit", matches: ["if-match ip-prefix AS269485-GTA"], applies: [] }] },
  { name: "CUST-RANGE", nodes: [{ sequence: 10, action: "permit", matches: ["if-match ip-prefix AS269485-RANGE"], applies: [] }] },
  { name: "CUST-V6", nodes: [{ sequence: 10, action: "permit", matches: ["if-match ipv6 address prefix-list AS266208-4WNET-V6-332"], applies: [] }] },
  { name: "MISSING", nodes: [{ sequence: 10, action: "permit", matches: ["if-match ip-prefix MISSING-LIST"], applies: [] }] },
];

const classifications = [
  { policyName: "ORIGIN-V4", policyType: "origin_target", family: "ipv4", prefixScope: [], confidence: "high", matrixSource: "policy_graph_community_resolver", includeInAnnouncementMatrix: true, findings: [] },
  { policyName: "ORIGIN-V6", policyType: "origin_target", family: "ipv6", prefixScope: [], confidence: "high", matrixSource: "policy_graph_community_resolver", includeInAnnouncementMatrix: true, findings: [] },
  { policyName: "CUST-V4", policyType: "customer_import_target", family: "ipv4", prefixScope: [], confidence: "high", matrixSource: "policy_graph_community_resolver", includeInAnnouncementMatrix: true, findings: [] },
  { policyName: "CUST-RANGE", policyType: "customer_import_target", family: "ipv4", prefixScope: [], confidence: "high", matrixSource: "policy_graph_community_resolver", includeInAnnouncementMatrix: true, findings: [] },
  { policyName: "CUST-V6", policyType: "customer_import_target", family: "ipv6", prefixScope: [], confidence: "high", matrixSource: "policy_graph_community_resolver", includeInAnnouncementMatrix: true, findings: [] },
  { policyName: "MISSING", policyType: "customer_import_target", family: "ipv4", prefixScope: [], confidence: "high", matrixSource: "policy_graph_community_resolver", includeInAnnouncementMatrix: true, findings: [] },
];

const result = resolveAnnouncementMatrix({
  rawConfig,
  routePolicies,
  catalogs: {
    ip_prefixes: {
      [String("AS269485-GTA").toUpperCase()]: { name: "AS269485-GTA", entries: [{ raw: "ip ip-prefix AS269485-GTA index 10 permit 45.187.201.0 24" }] },
      [String("AS269485-RANGE").toUpperCase()]: { name: "AS269485-RANGE", entries: [{ raw: "ip ip-prefix AS269485-RANGE index 10 permit 138.219.128.0 22 greater-equal 22 less-equal 24" }] },
    },
    ipv6_prefixes: {
      [String("AS266208-4WNET-V6-332").toUpperCase()]: { name: "AS266208-4WNET-V6-332", entries: [{ raw: "ip ipv6-prefix AS266208-4WNET-V6-332 index 10 permit 2804:5984:8000:: 32 greater-equal 32 less-equal 48" }] },
    },
  },
  classifications,
  bindings: [
    { policyName: "ORIGIN-V4", type: "NETWORK_USES_ORIGIN_POLICY", prefix: "45.169.160.0/23" },
    { policyName: "ORIGIN-V6", type: "NETWORK_USES_ORIGIN_POLICY", prefix: "2804:5984:8000::/35" },
  ],
});

const byName = new Map(result.rows.map((row) => [row.routePolicyName, row]));

assert.equal(byName.get("ORIGIN-V4")?.prefixScope.type, "network");
assert.equal(byName.get("ORIGIN-V4")?.prefixScope.expandedPrefixes[0]?.prefix, "45.169.160.0/23");
assert.equal(byName.get("ORIGIN-V6")?.prefixScope.type, "network");
assert.equal(byName.get("ORIGIN-V6")?.prefixScope.expandedPrefixes[0]?.prefix, "2804:5984:8000::/35");

assert.equal(byName.get("CUST-V4")?.prefixScope.type, "ip_prefix");
assert.equal(byName.get("CUST-V4")?.prefixScope.expandedPrefixes[0]?.prefix, "45.187.201.0/24");
assert.equal(byName.get("CUST-RANGE")?.prefixScope.expandedPrefixes[0]?.prefix, "138.219.128.0/22");
assert.equal(byName.get("CUST-RANGE")?.prefixScope.expandedPrefixes[0]?.ge, 22);
assert.equal(byName.get("CUST-RANGE")?.prefixScope.expandedPrefixes[0]?.le, 24);

assert.equal(byName.get("CUST-V6")?.prefixScope.type, "ipv6_prefix");
assert.equal(byName.get("CUST-V6")?.prefixScope.expandedPrefixes[0]?.prefix, "2804:5984:8000::/32");
assert.equal(byName.get("CUST-V6")?.prefixScope.expandedPrefixes[0]?.ge, 32);
assert.equal(byName.get("CUST-V6")?.prefixScope.expandedPrefixes[0]?.le, 48);

assert.equal(byName.get("MISSING")?.prefixScope.type, "ip_prefix");
assert.equal(byName.get("MISSING")?.prefixScope.affectedPrefixCount, 0);
assert.ok((byName.get("MISSING")?.findings ?? []).some((finding) => finding.code === "PREFIX_LIST_EMPTY"));
assert.ok((byName.get("MISSING")?.findings ?? []).some((finding) => finding.code === "PREFIX_LIST_EXPANSION_REQUIRED"));

assert.equal(result.summary.totalExpandedPrefixes, 5);
assert.equal(result.summary.totalPrefixScopeUnknown, 1);

console.log(JSON.stringify({
  ok: true,
  rows: result.rows.map((row) => ({
    policy: row.routePolicyName,
    prefixScope: row.prefixScope,
  })),
  summary: result.summary,
}, null, 2));
console.log("bgp-announcement-prefix-expansion-selftest: PASS");

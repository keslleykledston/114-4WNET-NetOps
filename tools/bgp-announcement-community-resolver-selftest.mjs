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
ip community-list CLIENTES|2G
 community 64777:50101
 community 64777:51003
route-policy DIRECT-OK permit node 10
 apply community 64777:50101
route-policy DIRECT-CONFLICT permit node 10
 apply community 64777:51001 64777:51003
route-policy LIST-OK permit node 10
 apply community community-list CLIENTES|2G
route-policy OFF permit node 10
 apply community 64777:51667
route-policy UNKNOWN permit node 10
 apply community 12345:99999
route-policy EMPTY-LIST permit node 10
 apply community community-list MISSING-LIST
`;

const routePolicies = [
  { name: "DIRECT-OK", nodes: [{ sequence: 10, action: "permit", matches: [], applies: ["apply community 64777:50101"] }] },
  { name: "DIRECT-CONFLICT", nodes: [{ sequence: 10, action: "permit", matches: [], applies: ["apply community 64777:51001 64777:51003"] }] },
  { name: "LIST-OK", nodes: [{ sequence: 10, action: "permit", matches: [], applies: ["apply community community-list CLIENTES|2G"] }] },
  { name: "OFF", nodes: [{ sequence: 10, action: "permit", matches: [], applies: ["apply community 64777:51667"] }] },
  { name: "UNKNOWN", nodes: [{ sequence: 10, action: "permit", matches: [], applies: ["apply community 12345:99999"] }] },
  { name: "EMPTY-LIST", nodes: [{ sequence: 10, action: "permit", matches: [], applies: ["apply community community-list MISSING-LIST"] }] },
];

const classifications = routePolicies.map((policy) => ({
  policyName: policy.name,
  policyType: "customer_import_target",
  family: "ipv4",
  prefixScope: [],
  confidence: "high",
  matrixSource: "policy_graph_community_resolver",
  includeInAnnouncementMatrix: true,
  findings: [],
}));

const result = resolveAnnouncementMatrix({
  rawConfig,
  routePolicies,
  catalogs: { ip_prefixes: {}, ipv6_prefixes: {} },
  classifications,
  bindings: [],
});

const byName = new Map(result.rows.map((row) => [row.routePolicyName, row]));

assert.equal(result.columns.length, 3);
assert.equal(byName.get("DIRECT-OK")?.cells["01"]?.label, "On");
assert.equal(byName.get("DIRECT-OK")?.cells["01"]?.communitySourceType, "direct");
assert.equal(byName.get("DIRECT-OK")?.cells["10"]?.state, "unmarked");

assert.equal(byName.get("DIRECT-CONFLICT")?.cells["10"]?.state, "conflict");
assert.equal(byName.get("DIRECT-CONFLICT")?.cells["10"]?.label, "!");
assert.ok((byName.get("DIRECT-CONFLICT")?.findings ?? []).some((finding) => finding.code === "MULTIPLE_ACTIONS_FOR_SAME_UPSTREAM"));

assert.equal(byName.get("LIST-OK")?.cells["01"]?.label, "On");
assert.equal(byName.get("LIST-OK")?.cells["10"]?.label, "P2");
assert.equal(byName.get("LIST-OK")?.cells["01"]?.communitySourceType, "community_list");
assert.equal(byName.get("LIST-OK")?.cells["01"]?.communitySourceName, "CLIENTES|2G");

assert.equal(byName.get("OFF")?.cells["16"]?.label, "Off");
assert.equal(byName.get("UNKNOWN")?.cells["01"]?.state, "unmarked");
assert.ok((byName.get("UNKNOWN")?.findings ?? []).some((finding) => finding.code === "UNKNOWN_COMMUNITY_NAMESPACE"));
assert.ok((byName.get("EMPTY-LIST")?.findings ?? []).some((finding) => finding.code === "COMMUNITY_LIST_NOT_FOUND"));

assert.ok(result.summary.totalOn >= 2);
assert.ok(result.summary.totalP2 >= 1);
assert.ok(result.summary.totalOff >= 1);
assert.ok(result.summary.totalConflict >= 1);
assert.ok(result.summary.totalUnknown >= 2);

console.log(JSON.stringify({
  ok: true,
  columns: result.columns,
  rows: result.rows.map((row) => ({
    policy: row.routePolicyName,
    cells: Object.fromEntries(Object.entries(row.cells).map(([circuitId, cell]) => [circuitId, { state: cell.state, label: cell.label, source: cell.communitySourceType }])),
  })),
  summary: result.summary,
}, null, 2));
console.log("bgp-announcement-community-resolver-selftest: PASS");

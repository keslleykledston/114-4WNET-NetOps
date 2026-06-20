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
network 45.169.160.0 255.255.254.0 route-policy ORIGIN-RP
route-policy ORIGIN-RP permit node 10
 apply community 64777:50101 64777:51003
route-policy CUST-RP permit node 10
 if-match ip-prefix CUST-PFX
 apply community 64777:51001
ip ip-prefix CUST-PFX index 10 permit 45.187.201.0 24
bgp 65000
 peer 192.0.2.1 as-number 65001
 ipv4-family unicast
  peer 192.0.2.1 route-policy CUST-RP import
`;

const routePolicies = [
  {
    name: "ORIGIN-RP",
    nodes: [{ sequence: 10, action: "permit", matches: [], applies: ["apply community 64777:50101 64777:51003"] }],
  },
  {
    name: "CUST-RP",
    nodes: [{ sequence: 10, action: "permit", matches: ["if-match ip-prefix CUST-PFX"], applies: ["apply community 64777:51001"] }],
  },
];

const bgpPeers = [
  { peerIp: "192.0.2.1", name: "customer-a", role: "customer", importPolicy: "CUST-RP", exportPolicy: null, addressFamily: "ipv4" },
];

const graph = buildAnnouncementGraph({ rawConfig, routePolicies, bgpPeers });
const byName = new Map(graph.payload.rows.map((row) => [row.routePolicyName, row]));

assert.equal(graph.payload.generatedFrom, "policy_graph_community_resolver");
assert.equal(graph.payload.featureStatus, "community_cells");
assert.ok(graph.payload.columns.length >= 2);

const originRow = byName.get("ORIGIN-RP");
assert.equal(originRow?.prefixScope.type, "network");
assert.equal(originRow?.cells["01"]?.label, "On");
assert.equal(originRow?.cells["10"]?.label, "P2");

const customerRow = byName.get("CUST-RP");
assert.equal(customerRow?.prefixScope.type, "ip_prefix");
assert.equal(customerRow?.prefixScope.expandedPrefixes[0]?.prefix, "45.187.201.0/24");
assert.equal(customerRow?.cells["10"]?.label, "On");

assert.ok(graph.summary.totalOn >= 2);
assert.ok(graph.summary.totalP2 >= 1);
assert.ok(graph.summary.totalUnmarked >= 1);
assert.ok(graph.summary.totalCells >= graph.payload.columns.length * graph.payload.rows.length);

console.log(JSON.stringify({
  ok: true,
  columns: graph.payload.columns,
  rows: graph.payload.rows.map((row) => ({
    policy: row.routePolicyName,
    prefixScope: row.prefixScope,
    cells: Object.fromEntries(Object.entries(row.cells).map(([circuitId, cell]) => [circuitId, { state: cell.state, label: cell.label, community: cell.community }])),
  })),
  summary: graph.summary,
}, null, 2));
console.log("bgp-announcement-matrix-cells-selftest: PASS");

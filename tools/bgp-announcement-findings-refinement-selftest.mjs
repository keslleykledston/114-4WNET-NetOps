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
bgp 268707
peer 203.0.113.1 as-number 65000
ip community-list CLIENTES|2G
 community 64777:50101
 community 64777:51003
ip community-filter basic C10-EXPORT-P2 permit 64777:51002
route-policy ORIGIN-1 permit node 10
 apply community community-list CLIENTES|2G
network 45.169.160.0 255.255.254.0 route-policy ORIGIN-1
route-policy C10-EXPORT-P2 permit node 10
 if-match community-filter C10-EXPORT-P2
 apply as-path 268707 additive
ipv4-family unicast
 peer 203.0.113.1 route-policy C10-EXPORT-P2 export
`;

const routePolicies = [
  { name: "ORIGIN-1", nodes: [{ sequence: 10, action: "permit", matches: [], applies: ["apply community community-list CLIENTES|2G"] }] },
  { name: "C10-EXPORT-P2", nodes: [{ sequence: 10, action: "permit", matches: ["if-match community-filter C10-EXPORT-P2"], applies: ["apply as-path 268707 additive"] }] },
];

const bgpPeers = [
  { peerIp: "203.0.113.1", name: "upstream-a", role: "provider", importPolicy: null, exportPolicy: "C10-EXPORT-P2", addressFamily: "ipv4" },
];

const graph = buildAnnouncementGraph({ rawConfig, routePolicies, bgpPeers, localAs: 268707 });

assert.ok(graph.payload.upstreamAudit);
assert.ok(graph.summary.upstreamAudit);
assert.ok((graph.summary.debugFindings ?? []).every((finding) => finding.scope));
assert.ok((graph.summary.debugFindings ?? []).every((finding) => finding.targetPolicyName || finding.upstreamCircuitId || finding.communityList || finding.communityFilter || finding.prefixList || finding.scope === "snapshot"));
assert.ok(graph.summary.totalFindings >= (graph.summary.debugFindings?.length ?? 0));
assert.ok(graph.summary.upstreamAudit);
assert.ok(graph.payload.rows.some((row) => row.targetPolicyName === "ORIGIN-1" && row.findings?.some((finding) => finding.code === "COMMUNITY_SET_EXACT_MATCH_FOUND")));

console.log(JSON.stringify({
  ok: true,
  summary: graph.summary,
  payloadAudit: graph.payload.upstreamAudit,
}, null, 2));
console.log("bgp-announcement-findings-refinement-selftest: PASS");

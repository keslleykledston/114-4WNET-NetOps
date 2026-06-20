#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { runAnnouncementUpstreamAudit } = await import(path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.audit.service.ts",
));

const rawConfig = `
bgp 268707
ip community-filter basic C10-WRONG-C01 permit 64777:50101
ip community-filter basic C10-EXPORT-P3 permit 64777:51008
ip community-filter basic C10-EXPORT-P2 permit 64777:51002
route-policy C10-EXPORT-P3 permit node 10
 if-match community-filter C10-EXPORT-P3
 apply as-path 268707 additive
route-policy C10-EXPORT-P2 permit node 10
 if-match community-filter C10-EXPORT-P2
 apply as-path 268707 268707 additive
route-policy C10-MISMATCH permit node 10
 if-match community-filter C10-WRONG-C01
 apply as-path 268707 additive
`;

const routePolicies = [
  { name: "C10-EXPORT-P3", nodes: [{ sequence: 10, action: "permit", matches: ["if-match community-filter C10-EXPORT-P3"], applies: ["apply as-path 268707 additive"] }] },
  { name: "C10-EXPORT-P2", nodes: [{ sequence: 10, action: "permit", matches: ["if-match community-filter C10-EXPORT-P2"], applies: ["apply as-path 268707 268707 additive"] }] },
  { name: "C10-MISMATCH", nodes: [{ sequence: 10, action: "permit", matches: ["if-match community-filter C10-WRONG-C01"], applies: ["apply as-path 268707 additive"] }] },
];

const classifications = routePolicies.map((policy) => ({
  policyName: policy.name,
  policyType: "upstream_export_audit",
  includeInAnnouncementMatrix: false,
}));

const audit = runAnnouncementUpstreamAudit({
  rawConfig,
  routePolicies,
  classifications,
  bindings: [],
  localAs: 268707,
});

assert.ok(audit.findings.some((finding) => finding.code === "COMMUNITY_FILTER_ACTION_CODE_MISMATCH"));
assert.ok(audit.findings.some((finding) => finding.code === "UPSTREAM_COMMUNITY_CIRCUIT_MISMATCH"));
assert.ok(audit.byCircuit["10"]);

console.log(JSON.stringify({
  ok: true,
  audit,
}, null, 2));
console.log("bgp-upstream-audit-conflict-selftest: PASS");

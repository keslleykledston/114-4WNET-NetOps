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
ip community-filter basic C01-EXPORT-P2 permit 64777:51002
ip community-filter basic C01-EXPORT-P3 permit 64777:51003
ip community-filter basic C02-EXPORT-P1 permit 64777:52001
route-policy C01-EXPORT-P2 permit node 10
 if-match community-filter C01-EXPORT-P2
 apply as-path 268707 additive
route-policy C01-EXPORT-P3 permit node 10
 if-match community-filter C01-EXPORT-P3
 apply as-path 268707 additive
route-policy C02-EXPORT-P1 permit node 10
 if-match community-filter C02-EXPORT-P1
 apply as-path 65000 additive
route-policy C03-EXPORT-NOEXPORT permit node 10
 if-match community-filter C03-EXPORT-NOEXPORT
 apply community no-export
`;

const routePolicies = [
  { name: "C01-EXPORT-P2", nodes: [{ sequence: 10, action: "permit", matches: ["if-match community-filter C01-EXPORT-P2"], applies: ["apply as-path 268707 additive"] }] },
  { name: "C01-EXPORT-P3", nodes: [{ sequence: 10, action: "permit", matches: ["if-match community-filter C01-EXPORT-P3"], applies: ["apply as-path 268707 additive"] }] },
  { name: "C02-EXPORT-P1", nodes: [{ sequence: 10, action: "permit", matches: ["if-match community-filter C02-EXPORT-P1"], applies: ["apply as-path 65000 additive"] }] },
  { name: "C03-EXPORT-NOEXPORT", nodes: [{ sequence: 10, action: "permit", matches: ["if-match community-filter C03-EXPORT-NOEXPORT"], applies: ["apply community no-export"] }] },
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

assert.ok(audit.byCircuit["01"]);
assert.ok(audit.byCircuit["02"]);
assert.ok(audit.byCircuit["03"]);
assert.equal(audit.byCircuit["01"].findings.some((finding) => finding.code === "AS_PATH_PREPEND_COUNT_MISMATCH"), true);
assert.equal(audit.byCircuit["02"].findings.some((finding) => finding.code === "AS_PATH_PREPEND_LOCAL_AS_MISMATCH"), true);
assert.equal(audit.byCircuit["03"].findings.some((finding) => finding.code === "UPSTREAM_EXPORT_POLICY_NO_OFF_RULE"), true);
assert.ok(audit.findings.some((finding) => finding.code === "AS_PATH_PREPEND_COUNT_MISMATCH"));
assert.ok(audit.findings.some((finding) => finding.code === "AS_PATH_PREPEND_LOCAL_AS_MISMATCH"));

console.log(JSON.stringify({
  ok: true,
  audit,
}, null, 2));
console.log("bgp-upstream-audit-local-as-selftest: PASS");

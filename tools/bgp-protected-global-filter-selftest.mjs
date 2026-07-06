#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildProtectedGlobalFilterFindings } = await import(path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.audit.service.ts",
));

const rawConfig = `
ip community-filter basic GLOBAL-EXPORT-UPSTREAM-P2 permit 64777:51002
ip community-filter basic GLOBAL-EXPORT-ALL-P3 permit 64777:51003
ip community-filter basic FULL-ROUTE-ALL permit 64777:50909
route-policy C01-EXPORT-P2 permit node 10
 if-match community-filter GLOBAL-EXPORT-UPSTREAM-P2
route-policy C02-EXPORT-P3 permit node 10
 if-match community-filter GLOBAL-EXPORT-ALL-P3
route-policy C03-EXPORT-FULL permit node 10
 if-match community-filter FULL-ROUTE-ALL
route-policy C04-EXPORT-P2 permit node 10
 if-match community-filter GLOBAL-EXPORT-UPSTREAM-P2
`;

const findings = buildProtectedGlobalFilterFindings(rawConfig);
assert.ok(findings.some((finding) => finding.code === "PROTECTED_GLOBAL_FILTER_SHARED_OK"));
assert.ok(findings.some((finding) => finding.code === "PROTECTED_GLOBAL_FILTER_PRESERVE_ON_REMOVE"));
assert.ok(findings.every((finding) => finding.scope === "protected_global_filter"));

console.log(JSON.stringify({
  ok: true,
  findings,
}, null, 2));
console.log("bgp-protected-global-filter-selftest: PASS");

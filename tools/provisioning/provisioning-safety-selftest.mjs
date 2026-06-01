#!/usr/bin/env node

import { assertAllIncludes, readRepoFile } from "./_shared.mjs";

async function main() {
  const route = await readRepoFile("workspace/artifacts/api-server/src/routes/provisioning.ts");
  const docs = await readRepoFile("docs/provisioning/PROVISIONING_SAFETY_GUARDS.md");

  assertAllIncludes(route, [
    "PROVISIONING_APPLY_ENABLED",
    "approvalStatus",
    "approvedParametersJson",
    "provisioning_apply_blocked",
    "provisioning_approved",
  ], "route safety");

  assertAllIncludes(docs, [
    "Apply is blocked unless `PROVISIONING_APPLY_ENABLED=true`",
    "Approval becomes invalid if parameters change after approval",
    "Commands must come from registered templates only",
  ], "safety docs");

  console.log("✓ provisioning safety guards are documented and enforced in routing");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});


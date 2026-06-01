#!/usr/bin/env node

import { assertAllIncludes, readRepoFile } from "./_shared.mjs";

async function main() {
  const env = await readRepoFile("workspace/artifacts/api-server/src/lib/env.ts");

  assertAllIncludes(env, [
    "provisioningPreviewEnabled",
    "provisioningApplyEnabled",
    "provisioningRollbackEnabled",
    "provisioningRequireApproval",
    "provisioningDryRunDefault",
    "provisioningExecuteEnabled",
    "configApplyEnabled",
    "dryRunDefault",
  ], "env flags");

  console.log("✓ provisioning flags are present and compatibility flags remain");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});


#!/usr/bin/env node

import { assertAllIncludes, readRepoFile } from "./_shared.mjs";

async function main() {
  const preview = await readRepoFile("workspace/artifacts/api-server/src/modules/provisioning/provisioning-preview.service.ts");
  const registry = await readRepoFile("workspace/artifacts/api-server/src/modules/provisioning/provisioning-template-registry.ts");

  assertAllIncludes(preview, [
    "buildL3vpnPreview",
    "l3vpn",
    "renderedConfigJson",
    "renderedValidationJson",
  ], "L3VPN preview");

  assertAllIncludes(registry, [
    "huawei-vrp-l3vpn",
    "l3vpn",
  ], "L3VPN template registry");

  console.log("✓ L3VPN preview wiring is present");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});


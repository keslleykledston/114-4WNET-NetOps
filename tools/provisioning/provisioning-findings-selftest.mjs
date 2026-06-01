#!/usr/bin/env node

import { assertAllIncludes, readRepoFile } from "./_shared.mjs";

async function main() {
  const types = await readRepoFile("workspace/artifacts/api-server/src/modules/provisioning/provisioning.types.ts");
  const validator = await readRepoFile("workspace/artifacts/api-server/src/modules/provisioning/provisioning-validator.ts");

  assertAllIncludes(types, [
    "VLAN_CONFLICT",
    "SUBINTERFACE_EXISTS",
    "INTERFACE_NOT_FOUND",
    "L2VC_ID_CONFLICT",
    "VSI_NAME_CONFLICT",
    "VRF_CONFLICT",
    "RD_CONFLICT",
    "RT_CONFLICT",
    "BGP_PEER_EXISTS",
    "ROUTE_POLICY_MISSING",
    "PREFIX_LIST_MISSING",
    "COMMUNITY_FILTER_MISSING",
    "TEMPLATE_MISSING",
    "CONNECTOR_UNAVAILABLE",
    "DEVICE_UNREACHABLE",
    "SNAPSHOT_STALE",
    "APPROVAL_REQUIRED",
    "APPLY_DISABLED",
  ], "finding codes");

  assertAllIncludes(validator, [
    "validateL2vpnPreviewRequest",
    "validateL3vpnPreviewRequest",
  ], "validator functions");

  console.log("✓ provisioning findings and structured validators are present");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});


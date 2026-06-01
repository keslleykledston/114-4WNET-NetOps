#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertAllIncludes, fileExists, readRepoFile } from "./provisioning/_shared.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const requiredDocs = [
    "docs/bgp/BGP_OPERATIONS_VS_DRILLDOWN_ANALYSIS.md",
    "docs/bgp/BGP_NAVIGATION_CONTEXT_BRIDGE.md",
    "reports/bgp/BGP_OPERATIONS_UX_RECOMMENDATION.md",
  ];

  for (const file of requiredDocs) {
    if (!(await fileExists(file))) throw new Error(`Missing required doc/report: ${file}`);
  }

  const bgpPanel = await readRepoFile("workspace/artifacts/netops-manager/src/features/bgp/bgp-panel.tsx");
  const operationalBgp = await readRepoFile("workspace/artifacts/netops-manager/src/pages/operational-bgp.tsx");
  const drilldownPage = await readRepoFile("workspace/artifacts/netops-manager/src/pages/bgp-peer-drilldown.tsx");
  const netopsOperations = await readRepoFile("workspace/artifacts/netops-manager/src/pages/netops-operations.tsx");
  const appTsx = await readRepoFile("workspace/artifacts/netops-manager/src/App.tsx");

  assertAllIncludes(
    bgpPanel,
    ["/bgp/peer-drilldown?deviceId=", "Drilldown"],
    "BGP panel drilldown link",
  );
  assertAllIncludes(
    operationalBgp,
    ["/bgp/peer-drilldown?deviceId=", "Drilldown", "Ações"],
    "Operational BGP drilldown link",
  );
  assertAllIncludes(
    drilldownPage,
    ["/netops-operations?deviceId=", "Voltar ao cockpit do device", "BgpPeerContextCard"],
    "BGP drilldown bridge",
  );
  assertAllIncludes(
    netopsOperations,
    ["new URLSearchParams(window.location.search)", "deviceId"],
    "NetOps Operations device bridge",
  );
  assertAllIncludes(
    appTsx,
    ["/netops-operations", "/operational/bgp", "/bgp/peer-drilldown"],
    "Route preservation",
  );

  const diffOutput = execFileSync("git", ["diff", "--name-only"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const blockedPrefixes = [
    "workspace/artifacts/api-server/src/modules/provisioning/",
    "workspace/artifacts/netops-manager/src/pages/provisioning.tsx",
    "workspace/artifacts/netops-manager/src/features/provisioning/",
    "workspace/lib/db/migrations/",
    "workspace/lib/db/src/schema/provisioning",
  ];
  const blocked = diffOutput.filter((file) => blockedPrefixes.some((prefix) => file.startsWith(prefix)));
  if (blocked.length > 0) {
    throw new Error(`Provisioning paths must stay untouched in this phase: ${blocked.join(", ")}`);
  }

  console.log("bgp-navigation-context-bridge-selftest: OK");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

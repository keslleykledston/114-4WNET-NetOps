#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(new URL(".", import.meta.url).pathname, "..", "..");

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function exists(file) {
  return fs.existsSync(path.join(repoRoot, file));
}

function main() {
  const expectedFiles = [
    "workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor.types.ts",
    "workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor.utils.ts",
    "workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-observability.ts",
    "workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-api.ts",
    "workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-modal.tsx",
    "workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-community-editor-modal.tsx",
    "workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.types.ts",
    "workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.utils.ts",
    "workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.service.ts",
    "workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.controller.ts",
    "docs/bgp/BGP_POLICY_EDITOR_CONTEXT_SUMMARY.md",
    "docs/bgp/BGP_POLICY_EDITOR_NEXT_STEPS.md",
    "reports/bgp/BGP_POLICY_EDITOR_PHASE_STATUS.md",
  ];

  for (const file of expectedFiles) {
    assert(exists(file), `missing expected file: ${file}`);
  }

  const drilldownPage = read("workspace/artifacts/netops-manager/src/pages/bgp-peer-drilldown.tsx");
  const modal = read("workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-modal.tsx");
  const communityModal = read("workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-community-editor-modal.tsx");
  const contextCard = read("workspace/artifacts/netops-manager/src/features/bgp/bgp-peer-context-card.tsx");
  const diffNames = execFileSync("git", ["diff", "--name-only"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

  assert(contextCard.includes("Editar policy"), "context card missing policy editor action");
  assert(modal.includes("Apply real desabilitado nesta fase. Esta edição é apenas local/read-only."), "modal missing apply disabled note");
  assert(modal.includes("Editor de Policy de Importação"), "modal missing import policy editor title");
  assert(modal.includes("Preview normalizado"), "modal missing normalized preview section");
  assert(modal.includes("Findings"), "modal missing findings section");
  assert(modal.includes("Preview backend"), "modal missing backend preview badge");
  assert(modal.includes("Preview local fallback"), "modal missing local fallback badge");
  assert(modal.includes("Preview local"), "modal missing local preview badge");
  assert(modal.includes("Origem do último preview"), "modal missing preview origin summary");
  assert(modal.includes("Drift detectado"), "modal missing drift summary");
  assert(modal.includes("Último erro backend"), "modal missing backend error summary");
  assert(modal.includes("dry-run · apply off · rollback off"), "modal missing safety summary");
  assert(read("workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor.utils.ts").includes("BACKEND_PREVIEW_UNAVAILABLE"), "utils missing backend unavailable finding");
  assert(read("workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor.utils.ts").includes("PREVIEW_DRIFT_DETECTED"), "utils missing drift finding");
  assert(modal.includes("Dry-run"), "modal missing dry-run safety badge");
  assert(modal.includes("Alterações pendentes"), "modal missing pending-change warning flow");
  assert(communityModal.includes("Editar community"), "community modal missing edit label");

  const forbiddenPrefixes = [
    "workspace/lib/api-spec/openapi.yaml",
    "workspace/lib/db/migrations/",
  ];
  const forbiddenHits = diffNames.filter((file) => forbiddenPrefixes.some((prefix) => file.startsWith(prefix)));
  assert(forbiddenHits.length === 0, `backend/provisioning files changed in this phase: ${forbiddenHits.join(", ")}`);

  assert(!modal.includes("policy-editor/apply"), "unexpected policy editor apply endpoint reference");
  assert(!modal.includes("policy-editor/rollback"), "unexpected policy editor rollback endpoint reference");

  console.log("bgp-policy-editor-shell-selftest: PASS");
}

try {
  main();
} catch (error) {
  console.error("bgp-policy-editor-shell-selftest: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

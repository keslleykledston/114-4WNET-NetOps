#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(new URL(".", import.meta.url).pathname, "..", "..");

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const modal = read("workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-modal.tsx");
  const api = read("workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-api.ts");
  const utils = read("workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor.utils.ts");
  const types = read("workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor.types.ts");
  const diffNames = execFileSync("git", ["diff", "--name-only"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

  assert(api.includes("/api/bgp/peers/${deviceId}/${encodeURIComponent(peer)}/policy-editor/preview"), "preview api missing backend endpoint");
  assert(api.includes("BgpPolicyEditorPreviewApiError"), "preview api missing typed error");
  assert(modal.includes("Preview backend"), "modal missing backend preview label");
  assert(modal.includes("Preview local fallback"), "modal missing local fallback label");
  assert(modal.includes("Preview local"), "modal missing local preview label");
  assert(modal.includes("Origem do último preview"), "modal missing preview origin summary");
  assert(modal.includes("Drift detectado"), "modal missing drift summary");
  assert(modal.includes("Último erro backend"), "modal missing backend error summary");
  assert(modal.includes("dry-run · apply off · rollback off"), "modal missing safety summary");
  assert(utils.includes("BACKEND_PREVIEW_UNAVAILABLE"), "utils missing backend unavailable warning");
  assert(utils.includes("PREVIEW_DRIFT_DETECTED"), "utils missing drift warning");
  assert(modal.includes("Gerar preview"), "modal missing preview action");
  assert(modal.includes("Gerando..."), "modal missing loading state");
  assert(modal.includes("void triggerPreview()"), "modal should trigger async backend preview");
  assert(modal.includes("fallback"), "modal should mention fallback behavior");
  assert(modal.includes("Apply real desabilitado nesta fase. Esta edição é apenas local/read-only."), "modal missing read-only safety copy");
  assert(utils.includes("buildPolicyEditorPreviewRequest"), "utils missing preview request builder");
  assert(utils.includes("comparePreviewSummaries"), "utils missing drift comparison helper");
  assert(types.includes("BgpPolicyEditorPreviewSource"), "types missing preview source");
  assert(types.includes("BgpPolicyEditorPreviewRequest"), "types missing preview request");
  assert(types.includes("BgpPolicyEditorBackendPreviewResponse"), "types missing backend preview response");

  const forbiddenPrefixes = [
    "workspace/lib/api-spec/openapi.yaml",
    "workspace/lib/db/migrations/",
    "workspace/artifacts/api-server/src/modules/provisioning/",
  ];
  const forbiddenHits = diffNames.filter((file) => forbiddenPrefixes.some((prefix) => file.startsWith(prefix)));
  assert(forbiddenHits.length === 0, `forbidden paths changed in this phase: ${forbiddenHits.join(", ")}`);

  assert(!modal.includes("policy-editor/apply"), "unexpected apply endpoint reference");
  assert(!modal.includes("policy-editor/rollback"), "unexpected rollback endpoint reference");

  console.log("bgp-policy-editor-preview-integration-selftest: PASS");
}

try {
  main();
} catch (error) {
  console.error("bgp-policy-editor-preview-integration-selftest: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

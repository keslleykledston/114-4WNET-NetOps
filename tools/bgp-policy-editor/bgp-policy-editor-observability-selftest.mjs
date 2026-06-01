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
  const observability = read("workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-observability.ts");
  const modal = read("workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-modal.tsx");
  const diffNames = execFileSync("git", ["diff", "--name-only"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

  assert(observability.includes("preview_backend_success"), "missing backend success event");
  assert(observability.includes("preview_backend_failed"), "missing backend failed event");
  assert(observability.includes("preview_local_used"), "missing local used event");
  assert(observability.includes("preview_local_fallback_used"), "missing local fallback event");
  assert(observability.includes("preview_drift_detected"), "missing drift event");
  assert(observability.includes("deviceId"), "missing safe device identifier field");
  assert(observability.includes("routePolicyName"), "missing safe route policy field");
  assert(observability.includes("previewSource"), "missing safe preview source field");
  assert(observability.includes("findings"), "missing safe findings field");
  assert(observability.includes("backendErrorKind"), "missing safe backend error classification");

  const bannedTerms = [
    "password",
    "token",
    "secret",
    "ssh",
    "command",
    "stdout",
    "stderr",
    "config complete",
    "raw config",
  ];
  for (const term of bannedTerms) {
    assert(!observability.toLowerCase().includes(term), `observability should not include sensitive term: ${term}`);
  }

  assert(modal.includes("Origem do último preview"), "modal missing preview origin summary");
  assert(modal.includes("Drift detectado"), "modal missing drift summary");
  assert(modal.includes("Último erro backend"), "modal missing backend error summary");
  assert(modal.includes("dry-run · apply off · rollback off"), "modal missing safety summary");
  assert(!modal.includes("policy-editor/apply"), "unexpected apply endpoint reference");
  assert(!modal.includes("policy-editor/rollback"), "unexpected rollback endpoint reference");

  assert(!diffNames.some((file) => file.startsWith("workspace/lib/db/migrations/")), "migrations should not change");
  assert(!diffNames.includes("workspace/lib/api-spec/openapi.yaml"), "openapi should not change");
  assert(!diffNames.includes("workspace/artifacts/api-server/src/routes/provisioning.ts"), "provisioning route should not change");

  console.log("bgp-policy-editor-observability-selftest: PASS");
}

try {
  main();
} catch (error) {
  console.error("bgp-policy-editor-observability-selftest: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTsxBin } from "./lib/bgp-selftest-tsx.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const tsxBin = resolveTsxBin(rootDir);
if (!tsxBin) {
  console.error("bgp-announcement-full-suite: tsx not found (required to import .ts modules without committed .js artifacts)");
  process.exit(1);
}

const TESTS = [
  "tools/bgp-announcement-snapshot-selftest.mjs",
  "tools/bgp-announcement-refresh-flow-selftest.mjs",
  "tools/bgp-announcement-target-classification-selftest.mjs",
  "tools/bgp-announcement-community-resolver-selftest.mjs",
  "tools/bgp-announcement-prefix-expansion-selftest.mjs",
  "tools/bgp-announcement-matrix-cells-selftest.mjs",
  "tools/bgp-announcement-community-set-match-selftest.mjs",
  "tools/bgp-protected-global-filter-selftest.mjs",
  "tools/bgp-upstream-audit-local-as-selftest.mjs",
  "tools/bgp-upstream-audit-conflict-selftest.mjs",
  "tools/bgp-announcement-findings-refinement-selftest.mjs",
  "tools/bgp-announcement-preview-compiler-selftest.mjs",
  "tools/bgp-announcement-change-plan-selftest.mjs",
  "tools/bgp-announcement-approval-gate-selftest.mjs",
  "tools/bgp-announcement-dry-run-execution-selftest.mjs",
  "tools/bgp-announcement-execution-block-selftest.mjs",
  "tools/bgp-announcement-execution-lock-selftest.mjs",
  "tools/bgp-announcement-postcheck-selftest.mjs",
  "tools/bgp-announcement-real-execution-guard-selftest.mjs",
  "tools/bgp-announcement-rollback-selftest.mjs",
  "tools/bgp-announcement-rollback-postcheck-selftest.mjs",
  "tools/bgp-announcement-snapshot-diff-selftest.mjs",
  "tools/bgp-announcement-timelapse-selftest.mjs",
  "tools/bgp-announcement-e2e-flow-selftest.mjs",
];

function runTest(relativePath) {
  const started = performance.now();
  const result = spawnSync(tsxBin, [path.join(rootDir, relativePath)], {
    cwd: rootDir,
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return {
    path: relativePath,
    ok: result.status === 0,
    ms: Math.round(performance.now() - started),
    output,
    code: result.status ?? 1,
  };
}

async function main() {
  console.log("BGP Announcement Matrix — full suite");
  console.log("=".repeat(60));

  const results = [];
  for (const testPath of TESTS) {
    const result = runTest(testPath);
    results.push(result);
    const label = result.ok ? "PASS" : "FAIL";
    console.log(`[${label}] ${testPath} (${result.ms}ms)`);
    if (!result.ok) {
      console.log(result.output);
    }
  }

  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  const totalMs = results.reduce((sum, item) => sum + item.ms, 0);

  console.log("=".repeat(60));
  console.log(`Summary: ${passed}/${results.length} passed, ${failed} failed, ${totalMs}ms total`);

  if (failed > 0) {
    console.error("bgp-announcement-full-suite: FAIL");
    process.exit(1);
  }

  console.log("bgp-announcement-full-suite: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

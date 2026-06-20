#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(rootDir, relativePath)], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("close", (code) => {
      resolve({
        path: relativePath,
        ok: code === 0,
        ms: Math.round(performance.now() - started),
        output: output.trim(),
        code: code ?? 1,
      });
    });
  });
}

async function main() {
  console.log("BGP Announcement Matrix — full suite");
  console.log("=".repeat(60));

  const results = [];
  for (const testPath of TESTS) {
    const result = await runTest(testPath);
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

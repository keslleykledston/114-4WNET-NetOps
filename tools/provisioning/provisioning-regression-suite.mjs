#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolveRepoPath } from "./_shared.mjs";

const adminEnv = {
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "admin@example.com",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "admin123456",
};

const scripts = [
  { label: "docs-check", script: "tools/provisioning/provisioning-docs-check.mjs" },
  { label: "flags", script: "tools/provisioning/provisioning-flags-selftest.mjs" },
  { label: "findings", script: "tools/provisioning/provisioning-findings-selftest.mjs" },
  { label: "preview-l2vpn", script: "tools/provisioning/provisioning-preview-l2vpn-selftest.mjs" },
  { label: "preview-l3vpn", script: "tools/provisioning/provisioning-preview-l3vpn-selftest.mjs" },
  { label: "safety", script: "tools/provisioning/provisioning-safety-selftest.mjs" },
  { label: "preview", script: "tools/provisioning-preview-selftest.mjs", env: adminEnv },
  { label: "template-registry", script: "tools/provisioning-template-registry-selftest.mjs", env: adminEnv },
  { label: "rbac", script: "tools/rbac-selftest.mjs", env: adminEnv },
  { label: "secrets-leak", script: "tools/secrets-leak-selftest.mjs", env: adminEnv },
];

const results = [];

for (const entry of scripts) {
  console.log(`\n== ${entry.label} ==`);
  const result = spawnSync("node", [resolveRepoPath(entry.script)], {
    stdio: "inherit",
    env: {
      ...process.env,
      ...entry.env,
    },
  });

  const ok = result.status === 0;
  results.push({ label: entry.label, ok, status: result.status ?? 1 });
}

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;

console.log("\nProvisioning regression suite summary");
for (const result of results) {
  console.log(`- ${result.ok ? "PASS" : "FAIL"} ${result.label}`);
}
console.log(`Total: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}

console.log("✓ provisioning regression suite passed");

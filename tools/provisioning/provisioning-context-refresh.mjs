#!/usr/bin/env node

import { readRepoFile } from "./_shared.mjs";

async function main() {
  const summary = await readRepoFile("docs/provisioning/PROVISIONING_CONTEXT_SUMMARY.md");
  const phase = await readRepoFile("reports/provisioning/PHASE_STATUS.md");

  const currentPhase = (phase.match(/^## Phase\s*\n\n(.+)$/m) ?? [null, "unknown"])[1].trim();
  const lastStatus = (summary.match(/^## Last phase status\s*\n\n(.+)$/m) ?? [null, "unknown"])[1].trim();

  console.log(`# Provisioning Context Refresh`);
  console.log(`Phase: ${currentPhase}`);
  console.log(`Status: ${lastStatus}`);
  console.log(`Summary: ${summary.length} chars`);
  console.log(`Phase report: ${phase.length} chars`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});


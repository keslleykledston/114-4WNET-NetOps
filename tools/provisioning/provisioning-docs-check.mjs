#!/usr/bin/env node

import { fileExists, readRepoFile } from "./_shared.mjs";

const required = [
  "docs/PROVISIONING_PREVIEW_ENGINE.md",
  "docs/PROVISIONING_TEMPLATE_MODEL.md",
  "docs/provisioning/CONTROLLED_EXECUTION.md",
  "docs/provisioning/PROVISIONING_SAFETY_GUARDS.md",
  "docs/provisioning/PROVISIONING_MVP_NEXT_STEPS.md",
  "docs/provisioning/PROVISIONING_CONTEXT_SUMMARY.md",
  "reports/provisioning/PHASE_STATUS.md",
];

async function main() {
  for (const path of required) {
    const exists = await fileExists(path);
    if (!exists) throw new Error(`Missing required doc: ${path}`);
  }

  const controlled = await readRepoFile("docs/provisioning/CONTROLLED_EXECUTION.md");
  const summary = await readRepoFile("docs/provisioning/PROVISIONING_CONTEXT_SUMMARY.md");
  const status = await readRepoFile("reports/provisioning/PHASE_STATUS.md");
  const nextSteps = await readRepoFile("docs/provisioning/PROVISIONING_MVP_NEXT_STEPS.md");

  for (const [label, text, needles] of [
    ["controlled execution", controlled, ["## Current phase note", "## Current safety flags"]],
    ["context summary", summary, ["## Architecture", "## Feature flags", "## Last phase status"]],
    ["phase status", status, ["## Phase", "## Tests executed", "## Next steps"]],
    ["next steps", nextSteps, ["## Estado atual", "## Próxima fase recomendada", "## Testes obrigatórios antes do próximo merge"]],
  ]) {
    for (const needle of needles) {
      if (!text.includes(needle)) throw new Error(`Missing ${needle} in ${label}`);
    }
  }

  console.log("✓ provisioning docs are present and structured");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

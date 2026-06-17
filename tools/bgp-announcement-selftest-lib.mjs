#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxCandidates = [
  path.join(root, "workspace/artifacts/netops-manager/node_modules/.bin/tsx"),
  path.join(root, "workspace/artifacts/api-server/node_modules/.bin/tsx"),
  path.join(root, "workspace/node_modules/.bin/tsx"),
];

const tsxBin = tsxCandidates.find((candidate) => {
  try {
    return spawnSync("test", ["-x", candidate]).status === 0;
  } catch {
    return false;
  }
});

if (!tsxBin) {
  console.error("tsx not found; run pnpm install in workspace/");
  process.exit(1);
}

export function runBgpAnnouncementSuite(suiteName, runnerFile = "bgp-announcement-selftest-suites.mts") {
  const runner = path.join(root, "tools", runnerFile);
  const result = spawnSync(tsxBin, [runner, suiteName], { stdio: "inherit", cwd: root });
  process.exit(result.status ?? 1);
}

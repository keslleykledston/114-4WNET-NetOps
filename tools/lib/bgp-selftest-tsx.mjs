import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveTsxBin(rootDir) {
  const candidates = [
    path.join(rootDir, "workspace/artifacts/netops-manager/node_modules/.bin/tsx"),
    path.join(rootDir, "workspace/node_modules/.bin/tsx"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function ensureTsxBootstrap(metaUrl, envKey = "BGP_SELFTEST_TSX") {
  if (process.env[envKey]) {
    return;
  }

  const selfPath = fileURLToPath(metaUrl);
  const rootDir = path.resolve(path.dirname(selfPath), "..");
  const tsxBin = resolveTsxBin(rootDir);
  if (!tsxBin) {
    console.error("bgp-selftest: tsx not found (required to import .ts modules without committed .js artifacts)");
    process.exit(1);
  }

  const result = spawnSync(tsxBin, [selfPath, ...process.argv.slice(2)], {
    cwd: rootDir,
    env: { ...process.env, [envKey]: "1" },
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

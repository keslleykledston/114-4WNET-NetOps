#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const code = `
import assert from "node:assert/strict";
import { classifyVsiVplsStatus } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/vsi-vpls/vsi-vpls.status.ts")).href)};

const up = classifyVsiVplsStatus({
  memberCount: 2,
  configsCount: 1,
  pwsTotal: 2,
  pwsUp: 2,
  hasActiveAlarm: false,
  hasDivergence: false,
  operationalStatuses: ["UP", "UP"],
  findings: [],
});
assert.equal(up.status, "UP");

const degraded = classifyVsiVplsStatus({
  memberCount: 2,
  configsCount: 1,
  pwsTotal: 2,
  pwsUp: 1,
  hasActiveAlarm: false,
  hasDivergence: true,
  operationalStatuses: ["UP", "DOWN"],
  findings: [{ code: "PW_PARTIAL_DOWN", severity: "warning" }],
});
assert.equal(degraded.status, "DEGRADED");

const down = classifyVsiVplsStatus({
  memberCount: 1,
  configsCount: 1,
  pwsTotal: 1,
  pwsUp: 0,
  hasActiveAlarm: true,
  hasDivergence: false,
  operationalStatuses: ["DOWN"],
  findings: [{ code: "VSI_DOWN", severity: "error" }],
});
assert.equal(down.status, "DOWN");

const configOnly = classifyVsiVplsStatus({
  memberCount: 0,
  configsCount: 1,
  pwsTotal: 0,
  pwsUp: 0,
  hasActiveAlarm: false,
  hasDivergence: false,
  operationalStatuses: [],
  findings: [],
});
assert.equal(configOnly.status, "CONFIG_ONLY");

const unknown = classifyVsiVplsStatus({
  memberCount: 0,
  configsCount: 0,
  pwsTotal: 0,
  pwsUp: 0,
  hasActiveAlarm: false,
  hasDivergence: false,
  operationalStatuses: [],
  findings: [],
});
assert.equal(unknown.status, "UNKNOWN");

console.log(JSON.stringify({ ok: true }, null, 2));
`;

const result = spawnSync("node", ["--experimental-strip-types", "--input-type=module", "-e", code], {
  cwd: rootDir,
  encoding: "utf8",
  env: process.env,
});

if (result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

console.log(result.stdout.trim());
console.log("vsi-vpls-status-selftest: OK");

#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parserDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/vsi-vpls");
const fixturePath = path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/l2circuits/parsers/__fixtures__/display-vsi-vpls-verbose.txt",
);

const fixture = readFileSync(fixturePath, "utf8");

const code = `
import assert from "node:assert/strict";
import { parseHuaweiVsiVpls } from ${JSON.stringify(pathToFileURL(path.join(parserDir, "vsi-vpls.parser.ts")).href)};
import { classifyVsiVplsStatus } from ${JSON.stringify(pathToFileURL(path.join(parserDir, "vsi-vpls.status.ts")).href)};

const parsed = parseHuaweiVsiVpls({
  "display vsi verbose": ${JSON.stringify(fixture)},
}, { tenantId: 10, site: "SITE-A", deviceId: 42 });

assert.equal(parsed.length, 2, "must parse two VSI/VPLS entries");
const up = parsed.find((item) => item.vsi_name === "VSI-CORE-100");
assert.ok(up, "VSI-CORE-100 must exist");
assert.equal(up.vs_id, "100");
assert.equal(up.peer_ip, "10.10.10.2");
assert.equal(up.interface_ac, "GigabitEthernet0/0/1");
assert.equal(up.raw_config_block.includes("VSI Name"), true);

const down = parsed.find((item) => item.vsi_name === "VSI-CORE-200");
assert.ok(down, "VSI-CORE-200 must exist");
assert.equal(down.vs_id, "200");
assert.equal(down.peer_ip, "10.10.20.2");
assert.equal(down.raw_config_block.includes("Backup service"), true);

const status = classifyVsiVplsStatus({
  memberCount: 2,
  configsCount: 2,
  pwsTotal: 2,
  pwsUp: 1,
  hasActiveAlarm: true,
  hasDivergence: true,
  operationalStatuses: ["UP", "DOWN"],
  findings: [{ code: "PW_PARTIAL_DOWN", severity: "warning" }],
});
assert.equal(status.status, "DEGRADED");
assert.ok(status.evidence.length > 0);

console.log(JSON.stringify({
  ok: true,
  parsed: parsed.map((item) => ({ vsi_name: item.vsi_name, vs_id: item.vs_id, peer_ip: item.peer_ip })),
  status,
}, null, 2));
`;

const result = spawnSync("pnpm", ["dlx", "tsx", "-e", code], {
  cwd: rootDir,
  encoding: "utf8",
  env: process.env,
});

if (result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

console.log(result.stdout);
console.log("vsi-vpls-parser-selftest: OK");

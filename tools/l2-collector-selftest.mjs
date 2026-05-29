#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const collectorPath = path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/l2circuits/collectors/ssh.collector.ts",
);
const commandsPath = path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/commands.ts",
);

const code = `
import assert from "node:assert/strict";
import { L2_SSH_COMMANDS } from ${JSON.stringify(pathToFileURL(collectorPath).href)};
import { validateReadonlyCommand } from ${JSON.stringify(pathToFileURL(commandsPath).href)};

const required = [
  "display mpls l2vc verbose",
  "display mpls l2vc",
  "display vsi verbose",
  "display interface description",
  "display current-configuration interface",
];

for (const cmd of required) {
  assert.ok(L2_SSH_COMMANDS.includes(cmd), \`collector must include: \${cmd}\`);
}

for (const cmd of L2_SSH_COMMANDS) {
  const check = validateReadonlyCommand(cmd);
  assert.equal(check.allowed, true, \`\${cmd} must be allowlisted: \${check.reason}\`);
}

console.log(JSON.stringify({ commands: L2_SSH_COMMANDS, allowlisted: true }, null, 2));
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
console.log("l2-collector-selftest: OK");

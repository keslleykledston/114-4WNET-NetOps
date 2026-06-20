#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const code = `
import assert from "node:assert/strict";
import { focusVsiVplsConfigText } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/vsi-vpls/vsi-vpls.config.ts")).href)};

const raw = [
  "#",
  "vsi L2L-2701",
  " pwsignal ldp",
  "  vsi-id 2701",
  "  peer 10.200.3.1",
  "  peer 10.200.5.1",
  " mtu 2000",
  "#",
  "interface Vlanif2701",
  " l2 binding vsi L2L-2701",
  "#",
  "interface Vlanif38",
  " l2 binding vsi L2L-2701",
  "#",
].join("\\n");

const focused = focusVsiVplsConfigText(raw, { vsId: "2701", vsiName: "L2L-2701" });
assert.ok(focused, "focused config must exist");
assert.equal(focused.includes("vsi L2L-2701"), true, "must keep selected VSI block");
assert.equal(focused.includes("vsi-id 2701"), true, "must keep selected VS-ID");
assert.equal(focused.includes("interface Vlanif2701"), true, "must keep bound Vlanif 2701");
assert.equal(focused.includes("interface Vlanif38"), true, "must keep aggregated Vlanif 38");
assert.equal(focused.includes("interface GigabitEthernet0/0/1"), false, "must drop unrelated interface");

console.log(JSON.stringify({ ok: true, focused }, null, 2));
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
console.log("vsi-vpls-config-selftest: OK");

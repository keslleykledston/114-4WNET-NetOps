#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const code = `
import assert from "node:assert/strict";
import { summarizeVsiVplsConfigBlocks } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/netops-manager/src/features/vsi-vpls/vsi-vpls-config-summary.ts")).href)};
import { summarizeVsiVplsTrafficDelivery } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/netops-manager/src/features/vsi-vpls/vsi-vpls-config-summary.ts")).href)};

const raw = [
  "#",
  "vsi L2L-2701",
  " pwsignal ldp",
  "  vsi-id 2701",
  "  peer 10.200.3.1",
  " mtu 2000",
  "#",
  "interface Vlanif2701",
  " l2 binding vsi L2L-2701",
  "#",
  "interface Vlanif38",
  " l2 binding vsi L2L-2701",
].join("\\n");

const blocks = summarizeVsiVplsConfigBlocks(raw, "2701", "L2L-2701");
const delivery = summarizeVsiVplsTrafficDelivery(blocks);
assert.equal(blocks.length, 3);
assert.equal(blocks[0].mode, "service");
assert.equal(blocks[0].title, "VSI L2L-2701");
assert.equal(blocks[1].title, "Vlanif2701");
assert.equal(blocks[1].mode, "tagged");
assert.equal(blocks[2].title, "Vlanif38");
assert.equal(blocks[2].mode, "untagged");
assert.ok(blocks[2].subtitle.includes("untagged"));
assert.ok(delivery.summaryText.includes("tagged"));
assert.ok(delivery.summaryText.includes("untagged"));

console.log(JSON.stringify({ ok: true, blocks }, null, 2));
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
console.log("vsi-vpls-config-summary-selftest: OK");

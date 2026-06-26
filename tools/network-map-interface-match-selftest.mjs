#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxBin = path.join(rootDir, "workspace/artifacts/netops-manager/node_modules/.bin/tsx");

function runTsx(code) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "netops-network-map-if-selftest-"));
  const tempFile = path.join(tempDir, "selftest.ts");
  writeFileSync(tempFile, code, "utf8");
  const result = spawnSync(tsxBin, [tempFile], { cwd: rootDir, encoding: "utf8" });
  rmSync(tempDir, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error(`selftest failed\nSTDOUT:\n${result.stdout ?? ""}\nSTDERR:\n${result.stderr ?? ""}`);
  }
}

const stencilLib = pathToFileURL(
  path.join(rootDir, "workspace/artifacts/netops-manager/src/components/network-map/device-stencils/device-stencil-library.ts"),
).href;
const stencils = pathToFileURL(
  path.join(rootDir, "workspace/artifacts/netops-manager/src/components/network-map/device-stencils/stencils.ts"),
).href;
const inventoryBridge = pathToFileURL(
  path.join(rootDir, "workspace/artifacts/netops-manager/src/lib/network-map/inventory-bridge.ts"),
).href;

const code = `
import assert from "node:assert/strict";
import { resolveStencilLibraryEntry } from ${JSON.stringify(stencilLib)};
import { buildStencil, physicalIfNamesFromInterfaces } from ${JSON.stringify(stencils)};
import { isLikelyPhysicalInterface, physicalInterfaces } from ${JSON.stringify(inventoryBridge)};

const device2 = {
  id: "device:2",
  name: "4WNET-BVA-BRT-RA",
  type: "switch",
  vendor: "huawei",
  model: "vrp",
  role: "network",
  site: "BVA",
  tenant: "4WNET",
  status: "UP",
};

const ifaces100 = [
  { name: "100GE0/0/1", kind: "physical", ifIndex: 177, operStatus: "up", adminStatus: "up", highSpeedMbps: 100000 },
  { name: "100GE0/0/2", kind: "physical", ifIndex: 178, operStatus: "up", adminStatus: "up", highSpeedMbps: 100000 },
  { name: "100GE0/0/3", kind: "physical", ifIndex: 179, operStatus: "down", adminStatus: "up", highSpeedMbps: 100000 },
  { name: "100GE0/0/4", kind: "physical", ifIndex: 180, operStatus: "up", adminStatus: "up", highSpeedMbps: 100000 },
  { name: "100GE0/0/5", kind: "physical", ifIndex: 181, operStatus: "up", adminStatus: "up", highSpeedMbps: 100000 },
  { name: "100GE0/0/6", kind: "physical", ifIndex: 182, operStatus: "up", adminStatus: "up", highSpeedMbps: 100000 },
];

const hints2 = {
  platform: "vrp",
  physicalIfNames: physicalIfNamesFromInterfaces(ifaces100),
};

const entry2 = resolveStencilLibraryEntry(device2, hints2);
assert(entry2, "expected stencil entry for S6730 100GE device");
assert.equal(entry2.id, "huawei-s6730");

const spec2 = buildStencil(device2, undefined, hints2);
const gePorts = spec2.ports.filter((p) => p.ifname.startsWith("100GE"));
assert.equal(gePorts.length, 6, "stencil must expose six 100GE ports");
assert(gePorts.every((p) => /^100GE0\\/0\\/[1-6]$/.test(p.ifname)), "100GE ifNames must map to live names");

const device43 = { ...device2, id: "device:43", name: "4WNET-BVA-PTL-RA" };
const ifaces40 = Array.from({ length: 6 }, (_, i) => ({
  name: \`40GE0/0/\${i + 1}\`,
  kind: "physical",
  ifIndex: 200 + i,
  operStatus: "up",
  adminStatus: "up",
}));
const hints43 = { platform: "vrp", physicalIfNames: physicalIfNamesFromInterfaces(ifaces40) };
const entry43 = resolveStencilLibraryEntry(device43, hints43);
assert.equal(entry43?.id, "huawei-s6730-40g");

const ne8000Hints = {
  platform: "vrp",
  physicalIfNames: ["100GE0/5/0", "100GE0/5/1", "100GE0/5/2"],
};
const entryNe = resolveStencilLibraryEntry({ ...device2, type: "router", model: "vrp" }, ne8000Hints);
assert.equal(entryNe?.id, "huawei-ne8000");

assert.equal(isLikelyPhysicalInterface({ name: "100GE0/0/1" }), true);
assert.equal(physicalInterfaces([{ name: "100GE0/0/1" }, { name: "Vlanif100", kind: "vlanif" }]).length, 1);

console.log("network-map-interface-match selftest passed");
`;

runTsx(code);

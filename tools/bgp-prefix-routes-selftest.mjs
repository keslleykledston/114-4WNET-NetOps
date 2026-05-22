#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxBin = path.join(rootDir, "workspace/artifacts/netops-manager/node_modules/.bin/tsx");
const fixturePath = path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/__fixtures__/bgp-routes-sample.txt");
const fixture = readFileSync(fixturePath, "utf8");

function runTsx(code) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "netops-bgp-routes-selftest-"));
  const tempFile = path.join(tempDir, "selftest.ts");
  writeFileSync(tempFile, code, "utf8");
  const result = spawnSync(tsxBin, [tempFile], {
    cwd: rootDir,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://netops:netops@127.0.0.1:5435/netops",
    },
    encoding: "utf8",
  });
  rmSync(tempDir, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error(`selftest failed\nSTDOUT:\n${result.stdout ?? ""}\nSTDERR:\n${result.stderr ?? ""}`);
  }
}

const code = `
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, bgpRouteHistoryTable } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/lib/db/src/index.ts")).href)};
import { parseHuaweiRoutes } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/routes-parser.ts")).href)};
import { MAX_DISPLAY_ROUTES, buildRouteCommands, queryBgpRoutes } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/device-discovery/services/bgp-routes.service.ts")).href)};

const fixture = ${JSON.stringify(fixture)};
const manyRoutes = Array.from({ length: 450 }, (_, i) => {
  const second = Math.floor(i / 256);
  const third = i % 256;
  return \`*> 10.\${second}.\${third}.0/24 192.0.2.1 0 100 0 65000 64512i\`;
}).join("\\n");

async function main() {
  assert.equal(MAX_DISPLAY_ROUTES, 200);
  assert(buildRouteCommands("10.20.1.5", "received", null).some((cmd) => cmd.includes("display bgp routing-table peer 10.20.1.5 received-routes")));
  assert(buildRouteCommands("2001:db8::5", "advertised", "CUST-VRF").some((cmd) => cmd.includes("vpnv6")));

  const parsed = parseHuaweiRoutes(fixture);
  assert.equal(parsed.reportedTotal, 3);
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0].prefix, "10.10.0.0/24");
  assert.equal(parsed.rows[0].asPath.startsWith("65000 64512"), true);

  const device = {
    id: 3,
    ipAddress: "192.0.2.10",
    sshPort: 22,
    username: "netops",
    passwordEncrypted: "stub",
  };

  const before = await db.select().from(bgpRouteHistoryTable).where(eq(bgpRouteHistoryTable.deviceId, device.id));
  const first = await queryBgpRoutes(
    device,
    "10.20.1.5",
    "C35-BGP-BVA-MNS",
    "received",
    null,
    { receivedRoutes: 1050786, advertisedRoutes: 10 },
    { limit: 500, page: 1 },
    async () => fixture,
  );
  assert.equal(first.limit, 200);
  assert.equal(first.total, 3);
  assert.equal(first.items.length, 3);
  assert.equal(first.excessWarning, true);
  assert.equal(first.warningMessage?.includes("alto volume"), true);

  const second = await queryBgpRoutes(
    device,
    "10.20.1.5",
    "C35-BGP-BVA-MNS",
    "received",
    null,
    { receivedRoutes: 1050786, advertisedRoutes: 10 },
    { limit: 2, page: 2 },
    async () => fixture,
  );
  assert.equal(second.limit, 2);
  assert.equal(second.page, 2);
  assert.equal(second.items.length, 1);
  assert.equal(second.hasNextPage, false);

  const manyFirst = await queryBgpRoutes(
    device,
    "10.20.1.5",
    "C35-BGP-BVA-MNS",
    "received",
    null,
    { receivedRoutes: 450, advertisedRoutes: 10 },
    { limit: 200, page: 1 },
    async () => manyRoutes,
  );
  assert.equal(manyFirst.total, 450);
  assert.equal(manyFirst.items.length, 200);
  assert.equal(manyFirst.hasNextPage, true);
  assert.equal(manyFirst.items[0].prefix, "10.0.0.0/24");

  const manyOffset = await queryBgpRoutes(
    device,
    "10.20.1.5",
    "C35-BGP-BVA-MNS",
    "received",
    null,
    { receivedRoutes: 450, advertisedRoutes: 10 },
    { limit: 200, offset: 200 },
    async () => manyRoutes,
  );
  assert.equal(manyOffset.page, 2);
  assert.equal(manyOffset.items.length, 200);
  assert.equal(manyOffset.hasPreviousPage, true);
  assert.equal(manyOffset.hasNextPage, true);
  assert.equal(manyOffset.items[0].prefix, "10.0.200.0/24");

  const manyLast = await queryBgpRoutes(
    device,
    "10.20.1.5",
    "C35-BGP-BVA-MNS",
    "received",
    null,
    { receivedRoutes: 450, advertisedRoutes: 10 },
    { limit: 200, page: 3 },
    async () => manyRoutes,
  );
  assert.equal(manyLast.items.length, 50);
  assert.equal(manyLast.hasNextPage, false);

  const after = await db.select().from(bgpRouteHistoryTable).where(eq(bgpRouteHistoryTable.deviceId, device.id));
  assert.equal(after.length, before.length + 5);

  console.log("bgp-prefix-routes selftest passed");
}

main();
`;

runTsx(code);

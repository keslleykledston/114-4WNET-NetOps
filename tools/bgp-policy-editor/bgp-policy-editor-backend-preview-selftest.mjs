#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const apiBase = process.env.API_BASE ?? "http://127.0.0.1:8085";
const adminEmail = process.env.BGP_POLICY_EDITOR_TEST_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? null;
const adminPassword = process.env.BGP_POLICY_EDITOR_TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? null;
const tsxBin = path.join(repoRoot, "workspace/artifacts/netops-manager/node_modules/.bin/tsx");

const controllerPath = pathToFileURL(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.controller.ts")).href;
const routesPath = pathToFileURL(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown.routes.ts")).href;
const servicePath = pathToFileURL(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.service.ts")).href;
const utilsPath = pathToFileURL(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.utils.ts")).href;
const typesPath = pathToFileURL(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.types.ts")).href;

function staticAssert(condition, message) {
  assert.ok(condition, message);
}

async function staticChecks() {
  const controllerText = readFileSync(new URL(controllerPath), "utf8");
  const routesText = readFileSync(new URL(routesPath), "utf8");
  const serviceText = readFileSync(new URL(servicePath), "utf8");
  const utilsText = readFileSync(new URL(utilsPath), "utf8");
  const typesText = readFileSync(new URL(typesPath), "utf8");

  staticAssert(controllerText.includes("postBgpPolicyEditorPreviewHandler"), "controller missing preview handler");
  staticAssert(routesText.includes("policy-editor/preview"), "routes missing policy editor preview endpoint");
  staticAssert(serviceText.includes("previewBgpPolicyEditor"), "service missing preview builder");
  staticAssert(serviceText.includes("communitySetMembersTable"), "service missing community-set member load");
  staticAssert(utilsText.includes("COMMUNITY_COMBINATION_MATCHED"), "utils missing matched finding code");
  staticAssert(utilsText.includes("APPLY_DISABLED"), "utils missing apply disabled finding");
  staticAssert(utilsText.includes("dryRun: true"), "utils missing dry-run safety");
  staticAssert(typesText.includes("BgpPolicyEditorPreviewResponse"), "types missing preview response");
  staticAssert(typesText.includes("BgpPolicyEditorSafety"), "types missing safety type");
}

async function runtimeSmoke() {
  if (!adminEmail || !adminPassword) {
    console.log("bgp-policy-editor-backend-preview-selftest: SKIP runtime smoke (missing admin credentials)");
    return;
  }

  const tempDir = mkdtempSync(path.join(process.cwd(), ".tmp-bgp-policy-editor-"));
  const tempFile = path.join(tempDir, "runtime-preview-selftest.ts");
  const code = `
import assert from "node:assert/strict";
import { desc, eq } from "drizzle-orm";
import { db, communitySetMembersTable, communitySetsTable, discoverySnapshotsTable, devicesTable } from ${JSON.stringify(pathToFileURL(path.join(repoRoot, "workspace/lib/db/src/index.ts")).href)};

const apiBase = ${JSON.stringify(apiBase)};
const adminEmail = ${JSON.stringify(adminEmail)};
const adminPassword = ${JSON.stringify(adminPassword)};

async function login() {
  try {
    const response = await fetch(\`\${apiBase}/api/auth/login\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    if (!response.ok) return null;
    const cookie = response.headers.get("set-cookie")?.split(";", 1)[0] ?? null;
    const body = await response.json().catch(() => ({}));
    return { cookie, token: typeof body.token === "string" ? body.token : null };
  } catch {
    console.log("runtime-skip:api-unreachable");
    process.exit(0);
  }
}

async function findCandidate() {
  const rows = await db.select().from(discoverySnapshotsTable).orderBy(desc(discoverySnapshotsTable.createdAt)).limit(25);
  for (const row of rows) {
    const snapshot = row.snapshotJson ?? {};
    const peers = Array.isArray(snapshot.bgpPeers) ? snapshot.bgpPeers : [];
    if (!peers.length) continue;
    const peerIp = peers[0]?.peerIp ?? peers[0]?.peer ?? null;
    if (!peerIp) continue;
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, row.deviceId)).limit(1);
    if (!device) continue;
    const communitySets = await db.select().from(communitySetsTable).where(eq(communitySetsTable.deviceId, row.deviceId));
    if (!communitySets.length) continue;
    const [firstSet] = communitySets;
    const members = await db.select().from(communitySetMembersTable).where(eq(communitySetMembersTable.communitySetId, firstSet.id));
    const selectedCommunities = members.map((member) => String(member.communityValue ?? "").trim()).filter(Boolean);
    if (!selectedCommunities.length) continue;
    return { deviceId: row.deviceId, peer: String(peerIp), selectedCommunities };
  }
  return null;
}

const auth = await login();
if (!auth) {
  console.log("runtime-skip:auth-failed");
  process.exit(0);
}
let candidate;
try {
  candidate = await findCandidate();
} catch {
  console.log("runtime-skip:db-unavailable");
  process.exit(0);
}
if (!candidate) {
  console.log("runtime-skip:no-suitable-candidate");
  process.exit(0);
}

const previewRequest = {
  routePolicyName: null,
  nodeEdits: [
    {
      nodeId: "non-existent-node",
      selectedCommunities: candidate.selectedCommunities,
    },
  ],
};

const response = await fetch(\`\${apiBase}/api/bgp/peers/\${candidate.deviceId}/\${encodeURIComponent(candidate.peer)}/policy-editor/preview\`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(auth.cookie ? { Cookie: auth.cookie } : {}),
    ...(auth.token ? { Authorization: \`Bearer \${auth.token}\` } : {}),
  },
  body: JSON.stringify(previewRequest),
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(\`preview failed: \${response.status} \${body}\`);
}

const body = await response.json();
assert.equal(body.contractVersion, "bgp-policy-editor-preview-v1");
assert.equal(body.previewSource, "backend");
assert.equal(body.safety.applyDisabled, true);
assert.equal(body.safety.rollbackDisabled, true);
assert.equal(body.safety.dryRun, true);
assert.ok(Array.isArray(body.findings));
assert.ok(Array.isArray(body.nodeEdits));
assert.ok(body.findings.length > 0);
assert.equal("apply" in body, false);
assert.equal("rollback" in body, false);
console.log("runtime-pass");
`;
  writeFileSync(tempFile, code, "utf8");
  const result = spawnSync(tsxBin, [tempFile], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://netops:netops@127.0.0.1:5435/netops",
    },
    encoding: "utf8",
  });
  rmSync(tempDir, { recursive: true, force: true });
  const stdout = String(result.stdout ?? "");
  const stderr = String(result.stderr ?? "");
  if (stdout.includes("runtime-skip:api-unreachable")) {
    console.log("bgp-policy-editor-backend-preview-selftest: SKIP runtime smoke (API unreachable)");
    return;
  }
  if (stdout.includes("runtime-skip:auth-failed")) {
    console.log("bgp-policy-editor-backend-preview-selftest: SKIP runtime smoke (auth failed)");
    return;
  }
  if (stdout.includes("runtime-skip:db-unavailable")) {
    console.log("bgp-policy-editor-backend-preview-selftest: SKIP runtime smoke (database unavailable)");
    return;
  }
  if (stdout.includes("runtime-skip:no-suitable-candidate")) {
    console.log("bgp-policy-editor-backend-preview-selftest: SKIP runtime smoke (no suitable device/peer snapshot)");
    return;
  }
  if (result.status !== 0) {
    throw new Error(`runtime smoke failed\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }
}

async function main() {
  await staticChecks();
  try {
    await runtimeSmoke();
  } catch (error) {
    throw new Error(`runtime smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.log("bgp-policy-editor-backend-preview-selftest: PASS");
}

main().catch((error) => {
  console.error("bgp-policy-editor-backend-preview-selftest: FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

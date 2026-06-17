#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxBin = path.join(repoRoot, "workspace/artifacts/netops-manager/node_modules/.bin/tsx");
const runner = path.join(repoRoot, "tools/change-plans-review-workflow-selftest-runner.mts");

const result = spawnSync(tsxBin, [runner], { cwd: repoRoot, encoding: "utf8", env: process.env });
if (result.status !== 0) {
  throw new Error(`selftest failed\nSTDOUT:\n${result.stdout ?? ""}\nSTDERR:\n${result.stderr ?? ""}`);
}

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:8085";
const adminEmail = process.env.ADMIN_EMAIL ?? process.env.RBAC_TEST_ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD ?? process.env.RBAC_TEST_ADMIN_PASSWORD;

async function optionalHttpChecks() {
  if (!adminEmail || !adminPassword) {
    console.log("Skipping HTTP checks (ADMIN_EMAIL/ADMIN_PASSWORD not set)");
    return;
  }

  const health = await fetch(`${baseUrl}/api/healthz`);
  if (!health.ok) {
    console.log("Skipping HTTP checks (API not healthy)");
    return;
  }

  async function login(email, password) {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.ok(res.ok, `login failed: ${res.status}`);
    return res.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
  }

  const adminCookie = await login(adminEmail, adminPassword);
  const listRes = await fetch(`${baseUrl}/api/change-plans?module=bgp_announcements&limit=5`, {
    headers: { Cookie: adminCookie, Accept: "application/json" },
  });
  if (listRes.status === 404) {
    console.log("Skipping HTTP checks (change-plans routes not deployed — rebuild api container)");
    return;
  }
  assert.ok(listRes.ok, `list change plans failed: ${listRes.status}`);
  const list = await listRes.json();
  assert.ok(Array.isArray(list.items), "list items array");
  console.log(`HTTP list ok (${list.items.length} items)`);
}

await optionalHttpChecks();
console.log("change-plans-review-workflow selftest complete");

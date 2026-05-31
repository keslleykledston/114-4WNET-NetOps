#!/usr/bin/env node
import assert from "node:assert/strict";

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8085";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "include",
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text.substring(0, 200)}`);
  }

  return response.json();
}

async function login(email, password) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

async function main() {
  try {
    console.log("compliance-baseline-selftest: starting");

    // Login
    console.log("  - Logging in...");
    await login(ADMIN_EMAIL, ADMIN_PASSWORD);

    // Create baseline
    console.log("  - Creating baseline...");
    const baselineRes = await request("/api/compliance/baselines", {
      method: "POST",
      body: JSON.stringify({
        scopeType: "SITE",
        scopeId: "DC1",
        name: "Test Baseline",
        description: "Test baseline for v0.9.1",
        rulesJson: { "huawei-interface-active-description": { enabled: false } },
      }),
    });
    assert(baselineRes.id, "baseline should have id");
    const baselineId = baselineRes.id;

    // Get baseline
    console.log("  - Fetching baseline...");
    const fetched = await request(`/api/compliance/baselines/${baselineId}`);
    assert(fetched.id === baselineId, "fetched baseline should match");

    // List baselines
    console.log("  - Listing baselines...");
    const list = await request("/api/compliance/baselines");
    assert(Array.isArray(list), "baselines list should be array");

    // Update baseline
    console.log("  - Updating baseline...");
    const updated = await request(`/api/compliance/baselines/${baselineId}`, {
      method: "PUT",
      body: JSON.stringify({ name: "Updated Test Baseline" }),
    });
    assert(updated.name === "Updated Test Baseline", "name should be updated");

    // Get trends
    console.log("  - Fetching trends...");
    const trends = await request("/api/compliance/trends?scope=global&days=30");
    assert(Array.isArray(trends), "trends should be array");

    // Get dashboard
    console.log("  - Fetching dashboard...");
    const dash = await request("/api/compliance/dashboard");
    assert(typeof dash.passed === "number", "dashboard should have passed count");

    // Delete baseline
    console.log("  - Deleting baseline...");
    await request(`/api/compliance/baselines/${baselineId}`, { method: "DELETE" });

    console.log("compliance-baseline-selftest: 7 checks OK");
    process.exit(0);
  } catch (error) {
    console.error("compliance-baseline-selftest: FAILED", error.message);
    process.exit(1);
  }
}

main();

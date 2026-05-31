#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  const result = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return result;
}

async function main() {
  try {
    console.log("compliance-engine-selftest: starting");

    // Login
    console.log("  - Logging in...");
    await login(ADMIN_EMAIL, ADMIN_PASSWORD);

    // Get list of devices
    console.log("  - Fetching devices...");
    const devices = await request("/api/devices");
    assert(Array.isArray(devices.devices), "devices should be array");
    if (devices.devices.length === 0) {
      console.log("  - No devices found, skipping compliance tests");
      console.log("compliance-engine-selftest: OK (no devices)");
      process.exit(0);
    }

    const deviceId = devices.devices[0].id;
    console.log(`  - Testing with device ${deviceId}`);

    // Trigger compliance run
    console.log("  - Triggering compliance run...");
    const runResult = await request(`/api/compliance/run/device/${deviceId}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    assert(runResult.jobId, "should return jobId");
    const jobId = runResult.jobId;

    // Poll for completion (max 30s)
    console.log("  - Polling job status...");
    let job = null;
    for (let i = 0; i < 30; i++) {
      const result = await request(`/api/compliance-jobs/${jobId}`);
      if (result.status !== "pending" && result.status !== "running") {
        job = result;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert(job, "job should complete within 30s");
    assert(["passed", "failed", "error"].includes(job.status), `status ${job.status} should be terminal`);

    // Check score calculation
    console.log("  - Checking device compliance endpoint...");
    const deviceCompliance = await request(`/api/devices/${deviceId}/compliance`);
    assert(typeof deviceCompliance.score === "number", "score should be number");
    assert(deviceCompliance.score >= 0 && deviceCompliance.score <= 100, "score should be 0-100");
    assert(["PASS", "WARNING", "FAIL"].includes(deviceCompliance.scoreCategory), "should have scoreCategory");

    // Check dashboard
    console.log("  - Checking dashboard...");
    const dashboard = await request("/api/compliance/dashboard");
    assert(typeof dashboard.passed === "number", "dashboard should have passed count");
    assert(typeof dashboard.failed === "number", "dashboard should have failed count");
    assert(typeof dashboard.passFindings === "number", "dashboard should have passFindings count");

    // Check findings export
    console.log("  - Checking findings endpoint...");
    const findings = await request("/api/compliance-findings");
    assert(Array.isArray(findings), "findings should be array");

    console.log("compliance-engine-selftest: 6 checks OK");
    process.exit(0);
  } catch (error) {
    console.error("compliance-engine-selftest: FAILED", error.message);
    process.exit(1);
  }
}

main();

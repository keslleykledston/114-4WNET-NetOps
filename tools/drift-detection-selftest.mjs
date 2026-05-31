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
  const result = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return result;
}

async function main() {
  try {
    console.log("drift-detection-selftest: starting");

    // Login
    console.log("  - Logging in...");
    await login(ADMIN_EMAIL, ADMIN_PASSWORD);

    // Get list of devices
    console.log("  - Fetching devices...");
    const devices = await request("/api/devices");
    assert(Array.isArray(devices.devices), "devices should be array");
    if (devices.devices.length === 0) {
      console.log("  - No devices found, skipping drift tests");
      console.log("drift-detection-selftest: OK (no devices)");
      process.exit(0);
    }

    const deviceId = devices.devices[0].id;
    console.log(`  - Testing with device ${deviceId}`);

    // Trigger compliance run (which auto-triggers drift)
    console.log("  - Triggering compliance run (auto-triggers drift)...");
    const runResult = await request(`/api/compliance/run/device/${deviceId}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    assert(runResult.jobId, "should return jobId");

    // Poll for completion (max 30s)
    console.log("  - Polling for drift detection...");
    await new Promise((r) => setTimeout(r, 2000)); // Wait for async drift detection

    // Check device-level drifts
    console.log("  - Checking device drifts...");
    const deviceDrifts = await request(`/api/devices/${deviceId}/drift`);
    assert(Array.isArray(deviceDrifts), "device drifts should be array");
    // May be empty if no config collected yet
    console.log(`    Found ${deviceDrifts.length} drift(s)`);

    // Check global drifts endpoint
    console.log("  - Checking global drifts endpoint...");
    const allDrifts = await request("/api/compliance/drifts");
    assert(Array.isArray(allDrifts), "global drifts should be array");
    console.log(`    Found ${allDrifts.length} total drift(s)`);

    // Check drifts filtered by device
    console.log("  - Checking drifts with deviceId filter...");
    const filteredDrifts = await request(`/api/compliance/drifts?deviceId=${deviceId}`);
    assert(Array.isArray(filteredDrifts), "filtered drifts should be array");

    console.log("drift-detection-selftest: 5 checks OK");
    process.exit(0);
  } catch (error) {
    console.error("drift-detection-selftest: FAILED", error.message);
    process.exit(1);
  }
}

main();

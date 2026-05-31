#!/usr/bin/env node
import assert from "node:assert/strict";

const API = process.env.API_BASE_URL || "http://127.0.0.1:8085";

async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    credentials: "include",
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  try {
    console.log("compliance-scheduler-selftest: starting");

    // Login
    await req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@example.com", password: "admin123" }),
    });

    // Create schedule
    const sch = await req("/api/compliance/schedules", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Global 1h",
        scopeType: "global",
        intervalHours: 1,
        contexts: ["compliance"],
        enabled: true,
      }),
    });
    assert(sch.id, "schedule should have id");

    // List schedules
    const list = await req("/api/compliance/schedules");
    assert(Array.isArray(list), "list should be array");

    // Run now
    const run = await req(`/api/compliance/schedules/${sch.id}/run-now`, { method: "POST" });
    assert(run.id, "run should have id");

    // Wait for run (async)
    await new Promise((r) => setTimeout(r, 2000));

    // Get history
    const hist = await req(`/api/compliance/schedules/${sch.id}/history`);
    assert(Array.isArray(hist), "history should be array");

    // Dashboard still works
    const dash = await req("/api/compliance/dashboard");
    assert(typeof dash.passed === "number", "dashboard should work");

    // Cleanup
    await req(`/api/compliance/schedules/${sch.id}`, { method: "DELETE" });

    console.log("compliance-scheduler-selftest: 7 checks OK");
    process.exit(0);
  } catch (err) {
    console.error("FAILED:", err.message);
    process.exit(1);
  }
}

main();

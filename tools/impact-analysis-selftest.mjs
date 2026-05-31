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
    console.log("impact-analysis-selftest: starting");

    // Login
    await req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@example.com", password: "admin123" }),
    });

    // Get summary (empty)
    const summary1 = await req("/api/impact/summary");
    assert(typeof summary1.totalScenarios === "number", "summary should have totalScenarios");

    // Analyze device impact
    const analysis = await req("/api/impact/analyze", {
      method: "POST",
      body: JSON.stringify({ targetType: "DEVICE", targetId: 1 }),
    });
    assert(analysis.id, "analysis should have id");
    const scenarioId = analysis.id;

    // List scenarios
    const scenarios = await req("/api/impact/scenarios");
    assert(Array.isArray(scenarios), "scenarios should be array");
    assert(scenarios.length > 0, "should have at least 1 scenario");

    // Get scenario details
    const details = await req(`/api/impact/scenarios/${scenarioId}`);
    assert(details.affectedItems, "details should have affectedItems");

    // Acknowledge
    await req(`/api/impact/scenarios/${scenarioId}/ack`, { method: "POST" });

    // Verify ack
    const acked = await req(`/api/impact/scenarios/${scenarioId}`);
    assert(acked.status === "ACKNOWLEDGED", "status should be ACKNOWLEDGED");

    // Resolve
    await req(`/api/impact/scenarios/${scenarioId}/resolve`, { method: "POST" });

    // Verify resolve
    const resolved = await req(`/api/impact/scenarios/${scenarioId}`);
    assert(resolved.status === "RESOLVED", "status should be RESOLVED");

    // Get summary (populated)
    const summary2 = await req("/api/impact/summary");
    assert(summary2.totalScenarios > 0, "summary should have scenarios");

    console.log("impact-analysis-selftest: 7 checks OK");
    process.exit(0);
  } catch (err) {
    console.error("FAILED:", err.message);
    process.exit(1);
  }
}

main();

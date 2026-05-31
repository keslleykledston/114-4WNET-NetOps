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
    console.log("topology-intelligence-selftest: starting");

    // Login
    await req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@example.com", password: "admin123" }),
    });

    // Get summary (empty)
    const summary1 = await req("/api/topology/summary");
    assert(typeof summary1.totalNodes === "number", "summary should have totalNodes");

    // Build topology
    const built = await req("/api/topology/rebuild", {
      method: "POST",
      body: JSON.stringify({ scope: "global" }),
    });
    assert(built.status === "rebuilt", "rebuild should return status");

    // Get summary (populated)
    const summary2 = await req("/api/topology/summary");
    assert(summary2.totalNodes >= 0, "summary should have totalNodes");

    // Get orphans
    const orphans = await req("/api/topology/orphans");
    assert(Array.isArray(orphans), "orphans should be array");

    // Get orphans summary
    const orphansSummary = await req("/api/topology/orphans/summary");
    assert(typeof orphansSummary.totalOrphans === "number", "orphansSummary should have totalOrphans");

    // Clear topology
    const cleared = await req("/api/topology/clear", { method: "POST" });
    assert(cleared.status === "cleared", "clear should return status");

    // Verify cleared
    const summary3 = await req("/api/topology/summary");
    assert(summary3.totalNodes === 0, "summary should be empty after clear");

    console.log("topology-intelligence-selftest: 7 checks OK");
    process.exit(0);
  } catch (err) {
    console.error("FAILED:", err.message);
    process.exit(1);
  }
}

main();

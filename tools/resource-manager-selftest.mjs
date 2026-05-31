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
    console.log("resource-manager-selftest: starting");

    // Login
    await req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@example.com", password: "admin123" }),
    });

    // Create pool
    const pool = await req("/api/resources/pools", {
      method: "POST",
      body: JSON.stringify({
        name: "Test VLAN Pool",
        resourceType: "VLAN",
        rangeStart: 100,
        rangeEnd: 200,
        vendor: "all",
        metadata: { environment: "test" },
      }),
    });
    assert(pool.id, "pool should have id");
    const poolId = pool.id;

    // Get usage
    const usage = await req(`/api/resources/usage/${poolId}`);
    assert(usage.total === 101, "pool total should be 101");
    assert(usage.allocated === 0, "allocated should be 0");

    // Allocate auto
    const alloc1 = await req("/api/resources/allocate", {
      method: "POST",
      body: JSON.stringify({ poolId }),
    });
    assert(alloc1.value === 100, "first allocation should be 100");

    // Allocate specific
    const alloc2 = await req("/api/resources/allocate", {
      method: "POST",
      body: JSON.stringify({ poolId, resourceValue: 150 }),
    });
    assert(alloc2.value === 150, "specific allocation should work");

    // Get next
    const next = await req(`/api/resources/next/${poolId}`);
    assert(next.next === 101, "next should be 101");

    // List allocations
    const allocs = await req("/api/resources/allocations");
    assert(allocs.length >= 2, "should have at least 2 allocations");

    // Reserve
    const reservation = await req("/api/resources/reserve", {
      method: "POST",
      body: JSON.stringify({
        poolId,
        resourceValue: 160,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    });
    assert(reservation.id, "reservation should have id");

    // Check collision (should be none for allocated=auto)
    const collisions = await req("/api/resources/collisions");
    assert(Array.isArray(collisions), "collisions should be array");

    // Check specific collision
    const check = await req("/api/resources/collisions/check", {
      method: "POST",
      body: JSON.stringify({ type: "VLAN", value: 100 }),
    });
    assert(typeof check.conflict === "boolean", "check should return conflict status");

    // Release
    await req(`/api/resources/release/${alloc1.id}`, { method: "POST" });

    // Verify released
    const usage2 = await req(`/api/resources/usage/${poolId}`);
    assert(usage2.allocated === 1, "allocated should be 1 after release");

    // Cleanup
    const cleanup = await req("/api/resources/cleanup", { method: "POST" });
    assert(typeof cleanup.cleaned === "number", "cleanup should return count");

    console.log("resource-manager-selftest: 7 checks OK");
    process.exit(0);
  } catch (err) {
    console.error("FAILED:", err.message);
    process.exit(1);
  }
}

main();

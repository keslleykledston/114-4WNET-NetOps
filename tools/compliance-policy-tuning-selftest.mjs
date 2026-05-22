#!/usr/bin/env node
// Compliance policy tuning selftest
// Validates dual-route compliance endpoints, profiles, and operational categories

import assert from "assert";

const API_BASE = process.env.API_BASE || "http://localhost:8085/api";
const ADMIN_EMAIL = process.env.COMPLIANCE_TEST_ADMIN_EMAIL || "admin@netops.local";
const ADMIN_PASSWORD = process.env.COMPLIANCE_TEST_ADMIN_PASSWORD || "Admin123!ChangeMe";
const DEVICE_ID = parseInt(process.env.DEVICE_ID || "1", 10);

let adminToken = null;

async function request(method, path, body = null) {
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, options);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

async function login() {
  const { status, data } = await request("POST", "/auth/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  assert.strictEqual(status, 200, `Login failed: ${status}`);
  adminToken = data.token;
  console.log("✓ Admin login successful");
}

async function testProfilesEndpoints() {
  // Test kebab-case endpoint
  const { status: status1, data: profiles1 } = await request("GET", "/compliance-policy-profiles");
  assert.strictEqual(status1, 200, `GET /compliance-policy-profiles failed: ${status1}`);
  assert(Array.isArray(profiles1), "Expected array response");
  assert(profiles1.length >= 3, `Expected 3+ profiles, got ${profiles1.length}`);
  console.log(`✓ GET /compliance-policy-profiles returned ${profiles1.length} profiles`);

  // Test slash-separated endpoint
  const { status: status2, data: profiles2 } = await request("GET", "/compliance/policy-profiles");
  assert.strictEqual(status2, 200, `GET /compliance/policy-profiles failed: ${status2}`);
  assert(Array.isArray(profiles2), "Expected array response");
  assert.strictEqual(profiles2.length, profiles1.length, "Profile counts don't match");
  console.log(`✓ GET /compliance/policy-profiles also returned ${profiles2.length} profiles`);

  // Verify default profiles exist
  const profileNames = new Set(profiles1.map((p) => p.name));
  assert(profileNames.has("huawei-vrp-edge-balanced"), "balanced profile missing");
  assert(profileNames.has("huawei-vrp-edge-strict"), "strict profile missing");
  assert(profileNames.has("huawei-vrp-observe-only"), "observe-only profile missing");
  console.log("✓ All 3 default profiles exist");

  return profiles1;
}

async function testJobsListEndpoints() {
  // Test kebab-case endpoint
  const { status: status1, data: jobs1 } = await request("GET", "/compliance-jobs");
  assert.strictEqual(status1, 200, `GET /compliance-jobs failed: ${status1}`);
  assert(Array.isArray(jobs1), "Expected array response");
  console.log(`✓ GET /compliance-jobs returned ${jobs1.length} jobs`);

  // Test slash-separated endpoint
  const { status: status2, data: jobs2 } = await request("GET", "/compliance/jobs");
  assert.strictEqual(status2, 200, `GET /compliance/jobs failed: ${status2}`);
  assert(Array.isArray(jobs2), "Expected array response");
  assert.strictEqual(jobs2.length, jobs1.length, "Job counts don't match");
  console.log(`✓ GET /compliance/jobs also returned ${jobs2.length} jobs`);
}

async function testSummaryEndpoints() {
  // Test kebab-case summary
  const { status: status1, data: summary1 } = await request("GET", "/compliance-jobs/summary");
  assert.strictEqual(status1, 200, `GET /compliance-jobs/summary failed: ${status1}`);
  assert(typeof summary1.totalJobs === "number", "Expected totalJobs number");
  assert(typeof summary1.passed === "number", "Expected passed number");
  assert(typeof summary1.failed === "number", "Expected failed number");
  console.log(`✓ GET /compliance-jobs/summary: ${summary1.totalJobs} total, ${summary1.passed} passed, ${summary1.failed} failed`);

  // Test slash-separated summary
  const { status: status2, data: summary2 } = await request("GET", "/compliance/jobs/summary");
  assert.strictEqual(status2, 200, `GET /compliance/jobs/summary failed: ${status2}`);
  assert.strictEqual(summary2.totalJobs, summary1.totalJobs, "Summary counts don't match");
  console.log(`✓ GET /compliance/jobs/summary also works`);
}

async function testCreateJobWithProfile() {
  const { status, data } = await request("POST", "/compliance-jobs", {
    deviceId: DEVICE_ID,
    contexts: ["security", "bgp"],
    policyProfileName: "huawei-vrp-edge-balanced",
  });

  if (status === 404) {
    console.log("⊘ Device not found (expected in test environment), skipping job creation");
    return null;
  }

  assert.strictEqual(status, 201, `POST /compliance-jobs failed: ${status}`);
  assert(data.id, "Job should have ID");
  assert.strictEqual(data.policyProfileName, "huawei-vrp-edge-balanced", "Profile not returned in response");
  console.log(`✓ Created compliance job #${data.id} with profile balanced`);
  return data.id;
}

async function testCreateJobWithAlternateProfile() {
  const { status, data } = await request("POST", "/compliance-jobs", {
    deviceId: DEVICE_ID,
    contexts: ["interface"],
    policyProfileName: "huawei-vrp-observe-only",
  });

  if (status === 404) {
    console.log("⊘ Device not found (expected in test environment), skipping alternate profile test");
    return null;
  }

  assert.strictEqual(status, 201, `POST /compliance-jobs failed: ${status}`);
  assert.strictEqual(data.policyProfileName, "huawei-vrp-observe-only", "Alternate profile not returned");
  console.log(`✓ Created job with profile observe-only`);
  return data.id;
}

async function testDualRouteCreateEndpoint() {
  // Test creating via slash-separated endpoint
  const { status, data } = await request("POST", "/compliance/jobs", {
    deviceId: DEVICE_ID,
    contexts: ["ntp"],
    policyProfileName: "huawei-vrp-edge-strict",
  });

  if (status === 404) {
    console.log("⊘ Device not found, skipping dual-route test");
    return;
  }

  assert.strictEqual(status, 201, `POST /compliance/jobs failed: ${status}`);
  assert.strictEqual(data.policyProfileName, "huawei-vrp-edge-strict", "Strict profile not set");
  console.log(`✓ Dual-route POST /compliance/jobs also works`);
}

async function testFindings() {
  const { status, data: findings } = await request("GET", "/compliance-findings");
  assert.strictEqual(status, 200, `GET /compliance-findings failed: ${status}`);
  assert(Array.isArray(findings), "Expected array response");

  if (findings.length > 0) {
    const finding = findings[0];
    assert(finding.operationalCategory !== undefined, "operationalCategory missing in findings");
    console.log(`✓ Findings have operationalCategory: ${findings.filter(f => f.operationalCategory).length} / ${findings.length}`);

    const categories = new Set(findings.map(f => f.operationalCategory));
    console.log(`  Categories found: ${Array.from(categories).join(", ")}`);
  } else {
    console.log("⊘ No findings found (expected if no compliance jobs ran)");
  }
}

async function main() {
  try {
    console.log("\n=== Compliance Policy Tuning Selftest ===\n");

    await login();
    await testProfilesEndpoints();
    await testJobsListEndpoints();
    await testSummaryEndpoints();
    await testCreateJobWithProfile();
    await testCreateJobWithAlternateProfile();
    await testDualRouteCreateEndpoint();
    await testFindings();

    console.log("\ncompliance policy tuning selftest passed\n");
  } catch (error) {
    console.error("\n❌ Selftest failed:", error.message);
    process.exit(1);
  }
}

main();

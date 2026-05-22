#!/usr/bin/env node

const API_URL = process.env.API_BASE_URL || "http://127.0.0.1:8085";
const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
const adminPassword = process.env.ADMIN_PASSWORD || "admin123456";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
};

let passed = 0;
let failed = 0;
let cookie = "";

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function test(name, result, error) {
  if (result) {
    passed++;
    log(colors.green, `✓ ${name}`);
  } else {
    failed++;
    log(colors.red, `✗ ${name}`);
    if (error) log(colors.red, `  ${error}`);
  }
}

async function request(method, path, headers = {}) {
  const url = new URL(path, API_URL);
  try {
    const res = await fetch(url, {
      method,
      headers: { "Cookie": cookie, ...headers },
    });
    let data = null;
    const contentType = res.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      data = await res.json();
    } else if (contentType?.includes("text/")) {
      data = await res.text();
    } else {
      data = await res.text();
    }
    return { status: res.status, data, headers: res.headers };
  } catch (error) {
    throw error;
  }
}

async function runTests() {
  log(colors.yellow, "\n=== Compliance Report Download Selftest ===\n");

  // Login first
  log(colors.yellow, "Setup: Authenticating...");
  try {
    const loginRes = await request("POST", "/api/auth/login", { "Content-Type": "application/json" });
    // Need to manually create the login request with body
    const url = new URL("/api/auth/login", API_URL);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    if (res.status === 200) {
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) {
        cookie = setCookie.split(";", 1)[0];
      }
      log(colors.green, "✓ Authentication successful");
    } else {
      log(colors.red, `✗ Authentication failed (${res.status})`);
      return;
    }
  } catch (e) {
    log(colors.red, `✗ Authentication error: ${e.message}`);
    return;
  }

  // Find a compliance job
  log(colors.yellow, "Setup: Finding compliance job...");
  const jobsRes = await request("GET", "/api/compliance/jobs");
  if (jobsRes.status !== 200) {
    log(colors.red, `✗ Failed to fetch jobs (${jobsRes.status}), skipping tests`);
    return;
  }

  const jobs = Array.isArray(jobsRes.data) ? jobsRes.data : jobsRes.data.data || [];
  if (jobs.length === 0) {
    log(colors.yellow, "⊘ No jobs found, tests skipped");
    return;
  }

  const jobId = jobs[0].id;
  log(colors.green, `✓ Using job ${jobId}`);

  // Test 1: Markdown format
  log(colors.yellow, "\nTest 1: Download markdown report");
  try {
    const res = await request("GET", `/api/compliance/jobs/${jobId}/report/download?format=markdown`);
    test("Markdown download status 200", res.status === 200);
    test("Markdown content-type", res.headers.get("content-type")?.includes("markdown"));
    test("Markdown is string", typeof res.data === "string");
    test("Markdown contains Summary", res.data?.includes?.("Summary"));
  } catch (e) {
    test("Markdown download", false, e.message);
  }

  // Test 2: JSON format
  log(colors.yellow, "\nTest 2: Download JSON report");
  try {
    const res = await request("GET", `/api/compliance/jobs/${jobId}/report/download?format=json`);
    test("JSON download status 200", res.status === 200);
    test("JSON content-type", res.headers.get("content-type")?.includes("json"));
    if (typeof res.data === "string") {
      try {
        JSON.parse(res.data);
        test("JSON is valid", true);
      } catch {
        test("JSON is valid", false);
      }
    } else {
      test("JSON is object", typeof res.data === "object");
    }
  } catch (e) {
    test("JSON download", false, e.message);
  }

  // Test 3: CSV format
  log(colors.yellow, "\nTest 3: Download CSV report");
  try {
    const res = await request("GET", `/api/compliance/jobs/${jobId}/report/download?format=csv`);
    test("CSV download status 200", res.status === 200);
    test("CSV content-type", res.headers.get("content-type")?.includes("csv"));
    test("CSV is string", typeof res.data === "string");
  } catch (e) {
    test("CSV download", false, e.message);
  }

  // Test 4: Findings export
  log(colors.yellow, "\nTest 4: Export findings CSV");
  try {
    const res = await request("GET", "/api/compliance/findings/export?format=csv");
    test("Findings export status", res.status === 200);
    test("Findings CSV content", typeof res.data === "string");
  } catch (e) {
    test("Findings export", false, e.message);
  }

  // Test 5: Groups export
  log(colors.yellow, "\nTest 5: Export groups CSV");
  try {
    const res = await request("GET", "/api/compliance/findings/groups/export?format=csv");
    test("Groups export status", res.status === 200);
    test("Groups CSV content", typeof res.data === "string");
  } catch (e) {
    test("Groups export", false, e.message);
  }

  // Test 6: Filename generation
  log(colors.yellow, "\nTest 6: Content-Disposition header");
  try {
    const res = await request("GET", `/api/compliance/jobs/${jobId}/report/download?format=markdown`);
    const disposition = res.headers.get("content-disposition");
    test("Has filename", disposition?.includes("filename="));
    test("Filename format", disposition?.includes(".md"));
  } catch (e) {
    test("Content-Disposition", false, e.message);
  }

  // Summary
  log(colors.yellow, `\n=== Results ===`);
  log(colors.green, `Passed: ${passed}`);
  log(colors.red, `Failed: ${failed}`);
  log(colors[failed === 0 ? "green" : "red"], `Total: ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  log(colors.red, `Fatal error: ${err.message}`);
  process.exit(1);
});

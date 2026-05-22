#!/usr/bin/env node
import assert from "node:assert/strict";

const baseUrl = process.env.NETOPS_BASE_URL ?? "http://127.0.0.1:8085/api";
const email = process.env.COMPLIANCE_TEST_ADMIN_EMAIL ?? "admin@netops.local";
const password = process.env.COMPLIANCE_TEST_ADMIN_PASSWORD ?? "Admin123!ChangeMe";

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
  }
  return { response, body };
}

const login = await api("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});
assert.equal(login.body.user.role, "admin");
const token = login.body.token;
const auth = { Authorization: `Bearer ${token}` };

const jobs = (await api("/compliance-jobs", { headers: auth })).body;
assert(Array.isArray(jobs));
assert(jobs.length > 0);

const latestByDevice = new Map();
for (const job of jobs) {
  const current = latestByDevice.get(job.deviceId);
  const createdAt = new Date(job.createdAt).getTime();
  if (!current || createdAt > new Date(current.createdAt).getTime() || (createdAt === new Date(current.createdAt).getTime() && job.id > current.id)) {
    latestByDevice.set(job.deviceId, job);
  }
}

const allFindings = (await api("/compliance-findings?freshness=all", { headers: auth })).body;
const latestFindings = (await api("/compliance-findings?latestJobOnly=true&freshness=all", { headers: auth })).body;
const currentFindings = (await api("/compliance-findings?freshness=current", { headers: auth })).body;
const legacyFindings = (await api("/compliance-findings?freshness=legacy", { headers: auth })).body;
const groupsLatest = (await api("/compliance-findings-groups?latestJobOnly=true&freshness=all", { headers: auth })).body;
const summary = (await api("/compliance-findings-freshness-summary", { headers: auth })).body;

assert(allFindings.length >= latestFindings.length);
assert(latestFindings.length > 0);
assert(groupsLatest.length > 0);

for (const finding of latestFindings) {
  assert.equal(finding.isLatestJobForDevice, true);
  assert.equal(finding.jobId, latestByDevice.get(finding.deviceId)?.id);
  assert(["current", "stale", "legacy", "superseded"].includes(finding.freshness));
}

for (const finding of currentFindings) {
  assert.equal(finding.freshness, "current");
  assert.equal(finding.complianceEngineVersion, summary.currentComplianceEngineVersion);
  assert.equal(finding.parserVersion, summary.currentParserVersion);
}

for (const finding of legacyFindings) {
  assert.equal(finding.freshness, "legacy");
}

assert.equal(typeof summary.current, "number");
assert.equal(typeof summary.stale, "number");
assert.equal(typeof summary.legacy, "number");
assert.equal(typeof summary.superseded, "number");
assert(Array.isArray(summary.latestJobs));
assert(summary.latestJobs.length === latestByDevice.size);

console.log("stale-findings selftest passed");

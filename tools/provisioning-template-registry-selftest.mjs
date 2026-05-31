#!/usr/bin/env node

/**
 * Selftest for Provisioning Template Registry (v0.8.1)
 * Tests:
 * - List templates
 * - Get template detail
 * - Get template versions
 * - Diff versions
 * - Export template
 * - Audit logs
 */

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8085";

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    process.exit(1);
  }
}

async function fetch_(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`${res.status}: ${body.error || res.statusText}`);
  }
  return res.json();
}

let templateId = null;

async function main() {
  console.log("Provisioning Template Registry Selftest\n");

  await test("GET /api/provisioning/templates", async () => {
    const templates = await fetch_("/api/provisioning/templates");
    if (!Array.isArray(templates) || templates.length === 0) {
      throw new Error("No templates returned");
    }
    templateId = templates[0].id;
    console.log(`  Found ${templates.length} templates`);
  });

  if (!templateId) {
    throw new Error("No template ID to continue tests");
  }

  await test(`GET /api/provisioning/templates/${templateId}`, async () => {
    const detail = await fetch_(`/api/provisioning/templates/${templateId}`);
    if (!detail.id || !detail.name) {
      throw new Error("Invalid template detail");
    }
    console.log(`  Template: ${detail.name} (status=${detail.status})`);
  });

  await test(`GET /api/provisioning/templates/${templateId}/versions`, async () => {
    const versions = await fetch_(`/api/provisioning/templates/${templateId}/versions`);
    if (!Array.isArray(versions)) {
      throw new Error("Invalid versions response");
    }
    console.log(`  Found ${versions.length} versions`);
  });

  await test(`GET /api/provisioning/templates/${templateId}/diff/:vA/:vB`, async () => {
    const diffs = await fetch_(`/api/provisioning/templates/${templateId}/diff/1.0.0/1.0.0`);
    if (!Array.isArray(diffs)) {
      throw new Error("Invalid diff response");
    }
    console.log(`  Diff contains ${diffs.length} lines`);
  });

  await test(`GET /api/provisioning/templates/${templateId}/export`, async () => {
    const res = await fetch(`${BASE_URL}/api/provisioning/templates/${templateId}/export`, {
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error(`${res.status}: ${res.statusText}`);
    }
    const exported = await res.json();
    if (!exported.template || !exported.templateBody) {
      throw new Error("Invalid export format");
    }
    console.log(`  Export OK (template masked: ${exported.templateBody.includes("[REDACTED]")})`);
  });

  await test(`GET /api/provisioning/templates/${templateId}/audit`, async () => {
    const logs = await fetch_(`/api/provisioning/templates/${templateId}/audit`);
    if (!Array.isArray(logs)) {
      throw new Error("Invalid audit logs response");
    }
    console.log(`  Audit logs: ${logs.length} entries`);
  });

  console.log("\n✓ All tests passed");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});

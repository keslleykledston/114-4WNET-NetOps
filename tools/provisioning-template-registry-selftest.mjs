#!/usr/bin/env node

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8085";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.RBAC_TEST_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.RBAC_TEST_ADMIN_PASSWORD || "admin123456";

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

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`${res.status}: ${body.error || res.statusText}`);
  }
  const data = await res.json();
  if (typeof data.token !== "string" || data.token.length < 10) {
    throw new Error("Missing auth token");
  }
  return data.token;
}

async function main() {
  console.log("Provisioning Template Registry Selftest\n");

  await test("GET /api/provisioning/templates requires auth", async () => {
    const res = await fetch(`${BASE_URL}/api/provisioning/templates`, {
      credentials: "include",
    });
    if (res.status !== 401) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Expected 401, got ${res.status}: ${body.error || res.statusText}`);
    }
  });

  const token = await login();

  await test("GET /api/provisioning/templates", async () => {
    const templates = await fetch_("/api/provisioning/templates", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!Array.isArray(templates) || templates.length < 3) {
      throw new Error("Expected at least 3 templates");
    }

    const required = ["l2vpn_vpws", "l2vpn_vpls", "l3vpn_vrf", "bgp_peer_customer", "bgp_peer_provider"];
    for (const serviceType of required) {
      const tpl = templates.find((item) => item.serviceType === serviceType);
      if (!tpl) {
        throw new Error(`Missing template ${serviceType}`);
      }
      if (typeof tpl.name !== "string" || !tpl.name) {
        throw new Error(`Invalid name for ${serviceType}`);
      }
      if (typeof tpl.configTemplateType !== "string" || !tpl.configTemplateType) {
        throw new Error(`Invalid configTemplateType for ${serviceType}`);
      }
      if (!tpl.parameterSchema || typeof tpl.parameterSchema !== "object") {
        throw new Error(`Invalid parameterSchema for ${serviceType}`);
      }
    }

    console.log(`  Found ${templates.length} templates in current catalog shape`);
  });

  console.log("\n✓ All tests passed");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});

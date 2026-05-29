#!/usr/bin/env node

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:8085";
const adminEmail = process.env.ADMIN_EMAIL ?? process.env.RBAC_TEST_ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD ?? process.env.RBAC_TEST_ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
  console.error("provisioning preview selftest needs ADMIN_EMAIL and ADMIN_PASSWORD.");
  process.exit(1);
}

async function request(path, { method = "GET", body, cookie } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { response, data };
}

function cookieFromResponse(response) {
  const setCookie = response.headers.get("set-cookie");
  return setCookie ? setCookie.split(";", 1)[0] : "";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function login() {
  const { response, data } = await request("/api/auth/login", {
    method: "POST",
    body: { email: adminEmail, password: adminPassword },
  });
  assert(response.ok, `login failed: ${response.status}`);
  return { cookie: cookieFromResponse(response), user: data.user };
}

async function main() {
  const results = [];
  const run = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`✓ ${name}`);
    } catch (error) {
      results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
      console.log(`✗ ${name} — ${error instanceof Error ? error.message : error}`);
    }
  };

  const { cookie } = await login();

  let templates = [];
  let deviceId = 1;

  await run("1. list templates", async () => {
    const { response, data } = await request("/api/provisioning/templates", { cookie });
    assert(response.ok, `status ${response.status}`);
    assert(Array.isArray(data) && data.length >= 3, "expected at least 3 templates");
    templates = data;
  });

  await run("2. BGP customer template exists", async () => {
    const tpl = templates.find((item) => item.id === "huawei-vrp-bgp-customer");
    assert(tpl, "huawei-vrp-bgp-customer missing");
  });

  await run("3. L3VPN VRF template exists", async () => {
    const tpl = templates.find((item) => item.id === "huawei-vrp-l3vpn-vrf");
    assert(tpl, "huawei-vrp-l3vpn-vrf missing");
  });

  await run("4. subinterface template exists", async () => {
    const tpl = templates.find((item) => item.id === "huawei-vrp-subinterface-dot1q");
    assert(tpl, "huawei-vrp-subinterface-dot1q missing");
  });

  await run("5. preview generates configPreview", async () => {
    const { response, data } = await request("/api/provisioning/preview", {
      method: "POST",
      cookie,
      body: {
        deviceId,
        templateId: "huawei-vrp-bgp-customer",
        parameters: {
          peerIp: "198.51.100.10",
          remoteAs: "65001",
          importPolicy: "RP-IN-TEST",
          exportPolicy: "RP-OUT-TEST",
          description: "selftest-customer",
          password: "secret-should-not-leak",
        },
        mode: "dry_run",
      },
    });
    assert(response.ok, `status ${response.status} ${JSON.stringify(data)}`);
    assert(typeof data.configPreview === "string" && data.configPreview.length > 20, "configPreview missing");
    assert(!data.configPreview.includes("secret-should-not-leak"), "password leaked in configPreview");
  });

  await run("6. preview generates rollbackPreview", async () => {
    const { response, data } = await request("/api/provisioning/preview", {
      method: "POST",
      cookie,
      body: {
        deviceId,
        templateId: "huawei-vrp-l3vpn-vrf",
        parameters: {
          vrfName: "CUST-SELFTEST",
          rd: "65000:9999",
          rtImport: "65000:9999",
          rtExport: "65000:9999",
        },
        mode: "dry_run",
      },
    });
    assert(response.ok, `status ${response.status}`);
    assert(typeof data.rollbackPreview === "string" && data.rollbackPreview.includes("Rollback"), "rollbackPreview missing");
  });

  await run("7. invalid required parameter returns blocked", async () => {
    const { response, data } = await request("/api/provisioning/preview", {
      method: "POST",
      cookie,
      body: {
        deviceId,
        templateId: "huawei-vrp-bgp-customer",
        parameters: { peerIp: "198.51.100.11" },
        mode: "dry_run",
      },
    });
    assert(response.ok, `status ${response.status}`);
    assert(data.status === "blocked", `expected blocked, got ${data.status}`);
    assert(data.missingData?.length > 0, "missingData expected");
  });

  await run("8. vendor incompatible blocks", async () => {
    const suffix = Date.now();
    const create = await request("/api/devices", {
      method: "POST",
      cookie,
      body: {
        hostname: `cisco-selftest-${suffix}`,
        ipAddress: `203.0.113.${(suffix % 200) + 10}`,
        vendor: "cisco",
        platform: "ios-xr",
        site: "lab",
        role: "edge",
        sshPort: 22,
        username: "admin",
        password: "test-only",
      },
    });
    assert(create.response.ok || create.response.status === 201, `create device failed ${create.response.status}`);
    const ciscoDeviceId = create.data?.id;
    assert(ciscoDeviceId, "cisco device id missing");

    const { response, data } = await request("/api/provisioning/preview", {
      method: "POST",
      cookie,
      body: {
        deviceId: ciscoDeviceId,
        templateId: "huawei-vrp-bgp-customer",
        parameters: {
          peerIp: "198.51.100.12",
          remoteAs: "65002",
          importPolicy: "RP-IN",
          exportPolicy: "RP-OUT",
        },
        mode: "dry_run",
      },
    });
    assert(response.ok, `status ${response.status}`);
    assert(data.status === "blocked", `expected blocked, got ${data.status}`);
    assert(
      data.blockedReasons?.some((item) => item.toLowerCase().includes("vendor") || item.toLowerCase().includes("incompatible")),
      "vendor incompatibility reason missing",
    );
  });

  await run("9. apply remains blocked", async () => {
    const { response, data } = await request("/api/provisioning/preview", {
      method: "POST",
      cookie,
      body: {
        deviceId,
        templateId: "huawei-vrp-subinterface-dot1q",
        parameters: {
          parentInterface: "GigabitEthernet0/0/1",
          vlanId: "100",
          description: "selftest-subif",
        },
        mode: "dry_run",
      },
    });
    assert(response.ok, `status ${response.status}`);
    assert(data.applyBlocked === true, "applyBlocked should be true");
    assert(data.applyBlockedReason?.includes("CONFIG_APPLY_ENABLED=false"), "apply blocked reason missing");
  });

  await run("10. export markdown works", async () => {
    const { response, data } = await request("/api/provisioning/preview/export", {
      method: "POST",
      cookie,
      body: {
        deviceId,
        templateId: "huawei-vrp-l3vpn-vrf",
        format: "markdown",
        parameters: {
          vrfName: "CUST-EXPORT",
          rd: "65000:100",
          rtImport: "65000:100",
          rtExport: "65000:100",
        },
      },
    });
    assert(response.ok, `status ${response.status}`);
    assert(data.format === "markdown", "format should be markdown");
    assert(data.content?.includes("Nenhuma configuração foi aplicada"), "safety notice missing");
  });

  await run("11. export json works", async () => {
    const { response, data } = await request("/api/provisioning/preview/export", {
      method: "POST",
      cookie,
      body: {
        deviceId,
        templateId: "huawei-vrp-l3vpn-vrf",
        format: "json",
        parameters: {
          vrfName: "CUST-JSON",
          rd: "65000:101",
          rtImport: "65000:101",
          rtExport: "65000:101",
        },
      },
    });
    assert(response.ok, `status ${response.status}`);
    assert(data.format === "json", "format should be json");
    const parsed = JSON.parse(data.content);
    assert(parsed.templateId === "huawei-vrp-l3vpn-vrf", "json content invalid");
  });

  await run("12. audit provisioning_preview_created", async () => {
    const before = Date.now();
    await request("/api/provisioning/preview", {
      method: "POST",
      cookie,
      body: {
        deviceId,
        templateId: "huawei-vrp-bgp-provider",
        parameters: {
          peerIp: "198.51.100.20",
          remoteAs: "3356",
          importPolicy: "RP-IN-UP",
          exportPolicy: "RP-OUT-UP",
        },
        mode: "dry_run",
      },
    });

    const audit = await request("/api/audit-logs?limit=20", { cookie });
    assert(audit.response.ok, `audit list failed ${audit.response.status}`);
    const entries = Array.isArray(audit.data) ? audit.data : audit.data?.items ?? [];
    const found = entries.find((entry) => entry.action === "provisioning_preview_created");
    assert(found, "provisioning_preview_created audit entry not found");
    assert(new Date(found.createdAt).getTime() >= before - 5000, "audit entry too old");
  });

  await run("13. secrets masked in audit metadata", async () => {
    await request("/api/provisioning/preview", {
      method: "POST",
      cookie,
      body: {
        deviceId,
        templateId: "huawei-vrp-bgp-customer",
        parameters: {
          peerIp: "198.51.100.30",
          remoteAs: "65003",
          importPolicy: "RP-IN",
          exportPolicy: "RP-OUT",
          password: "super-secret-password",
        },
        mode: "dry_run",
      },
    });

    const audit = await request("/api/audit-logs?limit=10", { cookie });
    const entries = Array.isArray(audit.data) ? audit.data : audit.data?.items ?? [];
    const previewAudit = entries.find((entry) => entry.action === "provisioning_preview_created");
    assert(previewAudit, "audit entry missing");
    const metadataRaw = typeof previewAudit.metadataJson === "string"
      ? previewAudit.metadataJson
      : JSON.stringify(previewAudit.metadata ?? previewAudit.metadataJson ?? {});
    assert(!metadataRaw.includes("super-secret-password"), "password leaked in audit metadata");
    assert(metadataRaw.includes("REDACTED") || metadataRaw.includes("redacted"), "password not masked in audit");
  });

  const failed = results.filter((item) => !item.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} test(s) failed.`);
    process.exit(1);
  }

  console.log("\nprovisioning preview selftest passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

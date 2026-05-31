#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = readEnvFile(path.join(root, ".env"));

const apiBase = `http://localhost:${env.API_PORT || "8085"}/api`;
const dbUser = env.POSTGRES_USER || "netops";
const dbName = env.POSTGRES_DB || "netops";
const adminEmail = env.ADMIN_EMAIL || "admin@example.com";
const adminPassword = env.ADMIN_PASSWORD || "admin123456";
const uniqueSeed = Date.now() + process.pid;
const unique = `${uniqueSeed}`;

function readEnvFile(filePath) {
  const text = readFileSync(filePath, "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx), line.slice(idx + 1)];
      }),
  );
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function uniqueTestIp() {
  const thirdOctet = 1 + (Math.abs(uniqueSeed) % 254);
  const fourthOctet = 1 + (Math.abs(Math.floor(uniqueSeed / 254)) % 254);
  return `192.0.${thirdOctet}.${fourthOctet}`;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function psql(sql) {
  return run("docker", [
    "compose",
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    dbUser,
    "-d",
    dbName,
    "-Atqc",
    sql,
  ]);
}

async function request(pathname, { method = "GET", body, token } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiBase}${pathname}`, {
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
  return { response, data, text };
}

function expect(condition, message) {
  assert.ok(condition, message);
}

function assertJsonResponse(result, context) {
  if (!result.response.ok) {
    throw new Error(`${context} failed with HTTP ${result.response.status}: ${typeof result.data === "string" ? result.data : JSON.stringify(result.data)}`);
  }
  return result.data;
}

async function login(email, password) {
  const result = await request("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  const data = assertJsonResponse(result, `login for ${email}`);
  expect(typeof data.token === "string" && data.token.length > 10, `Missing token for ${email}`);
  return { token: data.token, user: data.user };
}

async function createTenant(token) {
  const result = await request("/connectors/tenants", {
    method: "POST",
    token,
    body: {
      name: `Secrets Tenant ${unique}`,
      slug: `secrets-tenant-${unique}`,
    },
  });
  return assertJsonResponse(result, "create tenant");
}

async function createConnector(token, tenantId) {
  const result = await request("/connectors", {
    method: "POST",
    token,
    body: {
      tenant_id: tenantId,
      name: `secrets-connector-${unique}`,
      description: "Secrets leak test connector",
      wireguard_ip: "10.255.1.10",
      wireguard_endpoint: "vpn.netops.local:51820",
      wireguard_allowed_ips: "10.0.0.0/8,192.168.0.0/16",
      networks: [],
    },
  });
  const data = assertJsonResponse(result, "create connector");
  expect(typeof data.connector_token === "string", "Connector bootstrap token missing");
  return data;
}

async function createDevice() {
  const passwordEncrypted = `encrypted-${unique}`;
  const deviceIp = uniqueTestIp();
  const deviceId = Number(
    psql(`
      WITH inserted AS (
        INSERT INTO devices (
          hostname,
          ip_address,
          vendor,
          platform,
          ssh_port,
          username,
          password_encrypted,
          site,
          role,
          status,
          snmp_community,
          created_at,
          updated_at
        ) VALUES (
          ${sqlLiteral(`secrets-device-${unique}`)},
          ${sqlLiteral(deviceIp)},
          'huawei',
          'vrp',
          22,
          'admin',
          ${sqlLiteral(passwordEncrypted)},
          'lab',
          'pe',
          'unknown',
          ${sqlLiteral(`snmp-community-${unique}`)},
          now(),
          now()
        )
        RETURNING id
      )
      SELECT id FROM inserted;
    `).split("\n")[0],
  );
  expect(Number.isInteger(deviceId), "Failed to seed device");
  return { id: deviceId };
}

async function createCredentialProfile(token, tenantId) {
  const result = await request("/credential-profiles", {
    method: "POST",
    token,
    body: {
      id: `cred-${unique}`,
      tenant_id: tenantId,
      name: `Secrets SSH Credential ${unique}`,
      type: "SSH",
      vendor: "huawei",
      username: "admin",
      secret: `credential-secret-${unique}`,
    },
  });
  return assertJsonResponse(result, "create credential profile");
}

async function upsertNotificationSettings(token, tenantId) {
  const result = await request(`/tenants/${tenantId}/notifications`, {
    method: "PUT",
    token,
    body: {
      telegram_bot_token: `telegram-token-${unique}`,
      telegram_chat_id: `chat-${unique}`,
      webhook_url: `https://example.invalid/webhook/${unique}`,
      email_enabled: true,
      email_recipients: `noc-${unique}@example.invalid`,
    },
  });
  return assertJsonResponse(result, "upsert notification settings");
}

async function createConfigHistory(deviceId, connectorId) {
  const raw = [
    `sysname secrets-${unique}`,
    "interface GigabitEthernet0/0/1",
    " description baseline",
    "!",
  ].join("\n");
  const configId = psql(`
    WITH inserted AS (
      INSERT INTO collected_configs (
        device_id,
        connector_id,
        connector_job_id,
        source,
        raw_config,
        parsed_vlans,
        parsed_interfaces,
        parsed_bgp,
        parsed_l2vpn,
        parsed_l3vpn,
        parser_status,
        parser_error,
        parsed_summary_json,
        collected_at
      ) VALUES (
        ${deviceId},
        ${connectorId},
        NULL,
        'secrets-leak-selftest',
        ${sqlLiteral(raw)},
        '[]',
        '[]',
        '[]',
        '[]',
        '[]',
        'SUCCESS',
        NULL,
        ${sqlLiteral(JSON.stringify({ errors: [], warnings: [] }))}::jsonb,
        now()
      )
      RETURNING id
    )
    SELECT id FROM inserted;
  `).split("\n")[0];
  expect(Boolean(configId), "Failed to seed config history");
  return Number(configId);
}

function walkStrings(value, path = "$", collector = []) {
  if (value == null) return collector;
  if (typeof value === "string") {
    collector.push({ path, value });
    return collector;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, `${path}[${index}]`, collector));
    return collector;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      walkStrings(item, `${path}.${key}`, collector);
    }
  }
  return collector;
}

function assertNoSecrets(payload, secrets, context) {
  const strings = walkStrings(payload);
  for (const { path: stringPath, value } of strings) {
    for (const secret of secrets) {
      assert.ok(
        !value.includes(secret),
        `${context} leaked secret at ${stringPath}`,
      );
    }
  }
}

async function main() {
  const admin = await login(adminEmail, adminPassword);
  const tenant = await createTenant(admin.token);
  const connector = await createConnector(admin.token, tenant.id);
  const device = await createDevice();
  const credential = await createCredentialProfile(admin.token, tenant.id);
  const notificationSettings = await upsertNotificationSettings(admin.token, tenant.id);
  const configId = await createConfigHistory(device.id, connector.id);

  const secrets = [
    `connector_token-${unique}`,
    connector.connector_token,
    `telegram-token-${unique}`,
    `credential-secret-${unique}`,
    `ssh-password-${unique}`,
    `snmp-community-${unique}`,
    `preview-secret-${unique}`,
    `webhook-secret-${unique}`,
  ].filter(Boolean);

  const endpoints = [
    ["/connectors", "connectors list"],
    ["/connectors/health/summary", "connector health summary"],
    ["/connectors/groups", "connector groups list"],
    ["/credential-profiles", "credential profiles list"],
    ["/credential-assignments", "credential assignments list"],
    ["/tenant-notifications", "tenant notifications list"],
    ["/alert-notifications", "alert notifications list"],
    ["/devices", "devices list"],
    [`/devices/${device.id}`, "device detail"],
    [`/devices/${device.id}/config-history`, "config history list"],
    [`/configs/${configId}`, "config detail"],
    [`/configs/${configId}/diff`, "config diff"],
    ["/provisioning/templates", "provisioning templates"],
    ["/connectors/groups", "connector groups list"],
    [`/connectors/${connector.id}/health`, "connector health detail"],
    [`/connectors/${connector.id}/alerts`, "connector alerts"],
    [`/connectors/${connector.id}/wireguard/config`, "wireguard config"],
  ];

  for (const [pathname, label] of endpoints) {
    const result = await request(pathname, { token: admin.token });
    const data = assertJsonResponse(result, `GET ${pathname}`);
    assertNoSecrets(data, secrets, label);
  }

  const deviceExport = await request("/devices/export", {
    method: "POST",
    token: admin.token,
    body: { ids: [device.id], format: "json" },
  });
  const exportBody = assertJsonResponse(deviceExport, "POST /devices/export");
  assertNoSecrets(exportBody, secrets, "devices export json");
  expect(!JSON.stringify(exportBody).includes(`snmp-community-${unique}`), "SNMP community leaked in device export");

  const preview = await request("/provisioning/preview", {
    method: "POST",
    token: admin.token,
    body: {
      deviceId: device.id,
      serviceType: "bgp_peer_customer",
      parameters: {
        peerIp: "198.51.100.10",
        remoteAs: "65001",
        importPolicy: "RP-IN-SAFE",
        exportPolicy: "RP-OUT-SAFE",
        password: `preview-secret-${unique}`,
      },
      mode: "dry_run",
    },
  });
  const previewBody = assertJsonResponse(preview, "POST /provisioning/preview");
  assertNoSecrets(previewBody, secrets, "provisioning preview");

  const wireguardConfig = assertJsonResponse(await request(`/connectors/${connector.id}/wireguard/config`, { token: admin.token }), "GET /connectors/:id/wireguard/config");
  expect(!("connector_private_key" in wireguardConfig), "WireGuard private key should never be exposed");
  expect(typeof wireguardConfig.config === "string", "WireGuard config missing");

  expect(!JSON.stringify(credential).includes(`credential-secret-${unique}`), "Credential secret leaked on create response");
  expect(!JSON.stringify(notificationSettings).includes(`telegram-token-${unique}`), "Telegram token leaked on notification settings response");

  console.log("Secrets leak selftest passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

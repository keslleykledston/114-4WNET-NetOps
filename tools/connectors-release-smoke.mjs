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
const unique = `${Date.now()}-${process.pid}`;

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

function fail(message, details) {
  const suffix = details ? `: ${typeof details === "string" ? details : JSON.stringify(details)}` : "";
  throw new Error(`${message}${suffix}`);
}

function assertJsonResponse(result, context) {
  if (!result.response.ok) {
    fail(`${context} failed with HTTP ${result.response.status}`, result.data ?? result.text);
  }
  return result.data;
}

async function login(email, password) {
  const result = await request("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  const data = assertJsonResponse(result, `login for ${email}`);
  assert(typeof data.token === "string" && data.token.length > 10, `Missing token for ${email}`);
  return { token: data.token, user: data.user };
}

function expect(value, message) {
  assert.ok(value, message);
}

async function createTenant(token, suffix) {
  const result = await request("/connectors/tenants", {
    method: "POST",
    token,
    body: {
      name: `Smoke Tenant ${suffix}`,
      slug: `smoke-tenant-${suffix}`,
    },
  });
  const data = assertJsonResponse(result, "create tenant");
  expect(Number.isInteger(data.id), "Tenant id missing");
  return data;
}

async function createConnector(token, tenantId, suffix) {
  const createResult = await request("/connectors", {
    method: "POST",
    token,
    body: {
      tenant_id: tenantId,
      name: `smoke-connector-${suffix}`,
      description: "Release smoke connector",
      wireguard_ip: `10.255.0.${(Number.parseInt(String(suffix.slice(-2)), 16) % 200) + 2}`,
      wireguard_endpoint: "vpn.netops.local:51820",
      wireguard_allowed_ips: "10.0.0.0/8,192.168.0.0/16",
      networks: [{ network_cidr: "10.20.0.0/24", description: "smoke" }],
    },
  });
  const data = assertJsonResponse(createResult, "create connector");
  expect(Number.isInteger(data.id), "Connector id missing");
  expect(typeof data.wireguard_config_preview === "string", "WireGuard preview missing");
  expect(data.bootstrap_pending === true, "bootstrap_pending should be true");
  expect(data.connector_token === undefined, "connector_token should NOT be in response");

  const bootstrapResult = await request(`/connectors/${data.id}/bootstrap-package`, {
    method: "POST",
    token,
  });
  expect(bootstrapResult.status === 200, `Bootstrap package failed: ${bootstrapResult.status}`);
  const envContent = await bootstrapResult.text();
  const tokenMatch = envContent.match(/export CONNECTOR_TOKEN="(nc_[^"]+)"/);
  expect(tokenMatch && tokenMatch[1], "CONNECTOR_TOKEN not found in .env");
  const bootstrapToken = tokenMatch[1];

  const heartbeat = await request("/connectors/heartbeat", {
    method: "POST",
    token: bootstrapToken,
    body: {
      connector_name: data.name,
      status: "ONLINE",
      version: "smoke-rc",
      wireguard_status: "UP",
      lan_ip: "192.0.2.254",
      wg_ip: data.wireguard_ip,
    },
  });
  assertJsonResponse(heartbeat, "connector heartbeat");
  return data;
}

async function createDevice(token, connectorId, suffix) {
  const result = await request("/devices", {
    method: "POST",
    token,
    body: {
      hostname: `smoke-device-${suffix}`,
      ipAddress: `192.0.2.${(Number.parseInt(String(suffix.slice(-2)), 16) % 200) + 10}`,
      vendor: "huawei",
      platform: "vrp",
      sshPort: 22,
      username: "admin",
      password: "smoke-password-001",
      site: "lab",
      role: "pe",
      connectorId,
      snmpCommunity: "smoke-snmp-community-001",
    },
  });
  const data = assertJsonResponse(result, "create device");
  expect(Number.isInteger(data.id), "Device id missing");
  expect(data.snmpCommunity === null, "Device response leaked SNMP community");
  return data;
}

async function createCredentialProfile(token, tenantId, suffix) {
  const profileId = `cred-${suffix}`;
  const result = await request("/credential-profiles", {
    method: "POST",
    token,
    body: {
      id: profileId,
      tenant_id: tenantId,
      name: `Smoke SSH Credential ${suffix}`,
      type: "SSH",
      vendor: "huawei",
      username: "admin",
      secret: `ssh-secret-${suffix}`,
    },
  });
  const data = assertJsonResponse(result, "create credential profile");
  expect(data.secret_configured === true, "Credential profile should be marked configured");
  expect(!JSON.stringify(data).includes(`ssh-secret-${suffix}`), "Credential secret leaked");
  return data;
}

async function upsertNotificationSettings(token, tenantId, suffix) {
  const result = await request(`/tenants/${tenantId}/notifications`, {
    method: "PUT",
    token,
    body: {
      telegram_bot_token: `telegram-bot-token-${suffix}`,
      telegram_chat_id: `chat-${suffix}`,
      webhook_url: `https://example.invalid/hooks/${suffix}`,
      email_enabled: true,
      email_recipients: `noc-${suffix}@example.invalid`,
    },
  });
  const data = assertJsonResponse(result, "upsert notification settings");
  expect(data.telegram_bot_token_configured === true, "Telegram token should be marked configured");
  expect(!JSON.stringify(data).includes(`telegram-bot-token-${suffix}`), "Telegram token leaked");
  return data;
}

async function createConnectorGroup(token, tenantId, connectorId, suffix) {
  const created = await request("/connectors/groups", {
    method: "POST",
    token,
    body: {
      tenant_id: tenantId,
      name: `Smoke Group ${suffix}`,
      strategy: "ACTIVE_PASSIVE",
    },
  });
  const group = assertJsonResponse(created, "create connector group");
  expect(Number.isInteger(group.id), "Group id missing");

  const member = await request(`/connectors/groups/${group.id}/members/${connectorId}`, {
    method: "PUT",
    token,
    body: { priority: 10, weight: 1 },
  });
  assertJsonResponse(member, "add connector group member");
  return group;
}

async function seedConfigHistory(deviceId, connectorId, suffix) {
  const raw1 = [
    `sysname smoke-${suffix}`,
    "interface GigabitEthernet0/0/1",
    " description baseline",
    "!",
  ].join("\n");
  const raw2 = [
    `sysname smoke-${suffix}`,
    "interface GigabitEthernet0/0/1",
    " description updated",
    "!",
  ].join("\n");

  const config1Id = psql(`
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
        'release-smoke',
        ${sqlLiteral(raw1)},
        '[]',
        '[]',
        '[]',
        '[]',
        '[]',
        'SUCCESS',
        NULL,
        ${sqlLiteral(JSON.stringify({ errors: [], warnings: [] }))}::jsonb,
        now() - interval '10 minutes'
      )
      RETURNING id
    )
    SELECT id FROM inserted;
  `).split("\n")[0];

  const config2Id = psql(`
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
        'release-smoke',
        ${sqlLiteral(raw2)},
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

  expect(config1Id && config2Id, "Config history seed failed");
  return { config1Id: Number(config1Id), config2Id: Number(config2Id) };
}

function checkMigrations() {
  const fileCount = Number(run("bash", ["-lc", "find workspace/lib/db/migrations -maxdepth 1 -name '*.sql' | wc -l"]));
  const appliedCount = Number(psql("select count(*) from schema_migrations;"));
  assert.equal(appliedCount, fileCount, `Migration count mismatch: files=${fileCount} applied=${appliedCount}`);

  const tables = [
    "schema_migrations",
    "tenants",
    "connectors",
    "connector_groups",
    "connector_group_members",
    "connector_jobs",
    "connector_job_results",
    "connector_heartbeats",
    "credential_profiles",
    "credential_assignments",
    "tenant_notification_settings",
    "alert_notifications",
    "collected_configs",
    "config_diffs",
  ];
  for (const table of tables) {
    const exists = psql(`select to_regclass('public.${table}') is not null;`);
    assert.equal(exists, "t", `Missing table: ${table}`);
  }
}

function checkOpenApi() {
  const spec = readFileSync(path.join(root, "workspace/lib/api-spec/openapi.yaml"), "utf8");
  const result = execFileSync(
    "python3",
    ["-c", "import sys, yaml; yaml.safe_load(sys.stdin.read()); print('ok')"],
    { encoding: "utf8", input: spec, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
  assert.equal(result, "ok", "OpenAPI parse failed");
}

async function main() {
  console.log("Checking migrations and tables...");
  checkMigrations();

  console.log("Checking OpenAPI...");
  checkOpenApi();

  console.log("Checking unauthenticated RBAC...");
  const unauth = await request("/connectors/health/summary");
  assert.equal(unauth.response.status, 401, "Unauthenticated access should be rejected");

  console.log("Logging in as admin...");
  const admin = await login(adminEmail, adminPassword);

  console.log("Checking health endpoints...");
  const health = assertJsonResponse(await request("/healthz"), "GET /healthz");
  assert.equal(health.status, "ok", "API health failed");

  const summary = assertJsonResponse(await request("/connectors/health/summary", { token: admin.token }), "GET /connectors/health/summary");
  expect(typeof summary.total === "number", "Connector health summary total missing");

  const metrics = assertJsonResponse(await request("/connectors/metrics", { token: admin.token }), "GET /connectors/metrics");
  expect(typeof metrics.connector_total === "number", "Connector metrics missing");

  console.log("Creating release-candidate fixtures...");
  const tenant = await createTenant(admin.token, unique);
  const connector = await createConnector(admin.token, tenant.id, unique);
  const device = await createDevice(admin.token, connector.id, unique);
  const credential = await createCredentialProfile(admin.token, tenant.id, unique);
  const notificationSettings = await upsertNotificationSettings(admin.token, tenant.id, unique);
  const group = await createConnectorGroup(admin.token, tenant.id, connector.id, unique);
  const configs = await seedConfigHistory(device.id, connector.id, unique);

  console.log("Checking administrative endpoints...");
  const connectorList = assertJsonResponse(await request("/connectors", { token: admin.token }), "GET /connectors");
  expect(Array.isArray(connectorList), "Connectors list failed");

  const groupList = assertJsonResponse(await request("/connectors/groups", { token: admin.token }), "GET /connectors/groups");
  expect(Array.isArray(groupList), "Connector groups list failed");
  expect(groupList.some((item) => item.id === group.id), "Created connector group not visible");

  const groupDetail = assertJsonResponse(await request(`/connectors/groups/${group.id}`, { token: admin.token }), "GET /connectors/groups/:id");
  expect(Array.isArray(groupDetail.members), "Connector group detail members missing");

  const connectorDetail = assertJsonResponse(await request(`/connectors/${connector.id}/health`, { token: admin.token }), "GET /connectors/:id/health");
  expect(typeof connectorDetail.status === "string", "Connector health detail missing");

  const tenantNotifications = assertJsonResponse(await request("/tenant-notifications", { token: admin.token }), "GET /tenant-notifications");
  expect(Array.isArray(tenantNotifications), "Tenant notification settings list failed");

  const alerts = assertJsonResponse(await request("/alert-notifications", { token: admin.token }), "GET /alert-notifications");
  expect(Array.isArray(alerts), "Alert notifications list failed");

  const credentialList = assertJsonResponse(await request("/credential-profiles", { token: admin.token }), "GET /credential-profiles");
  expect(Array.isArray(credentialList), "Credential profiles list failed");
  expect(credentialList.some((item) => item.id === credential.id), "Created credential profile not visible");
  expect(!JSON.stringify(credentialList).includes(`ssh-secret-${unique}`), "Credential secret leaked in list");

  const credentialAssignments = assertJsonResponse(await request("/credential-assignments", { token: admin.token }), "GET /credential-assignments");
  expect(Array.isArray(credentialAssignments), "Credential assignments list failed");

  const configHistory = assertJsonResponse(await request(`/devices/${device.id}/config-history`, { token: admin.token }), "GET /devices/:id/config-history");
  expect(Array.isArray(configHistory), "Config history list failed");
  expect(configHistory.length >= 2, "Config history should contain both snapshots");

  const configDetail = assertJsonResponse(await request(`/configs/${configs.config2Id}`, { token: admin.token }), "GET /configs/:id");
  expect(configDetail.raw_config?.includes(`smoke-${unique}`), "Config detail missing seed");

  const configDiff = assertJsonResponse(await request(`/configs/${configs.config2Id}/diff`, { token: admin.token }), "GET /configs/:id/diff");
  expect(typeof configDiff.diff_text === "string", "Config diff missing");

  const preview = assertJsonResponse(await request("/provisioning/preview", {
    method: "POST",
    token: admin.token,
    body: {
      deviceId: device.id,
      serviceType: "bgp_peer_customer",
      parameters: {
        peerIp: "198.51.100.10",
        remoteAs: "65001",
        importPolicy: "RP-IN-SMOKE",
        exportPolicy: "RP-OUT-SMOKE",
        description: `smoke-${unique}`,
        password: `preview-secret-${unique}`,
      },
      mode: "dry_run",
    },
  }), "POST /provisioning/preview");
  expect(Array.isArray(preview.validations), "Provisioning preview validations missing");
  expect(preview.applyBlocked === true, "Provisioning preview should remain blocked");
  expect(!JSON.stringify(preview).includes(`preview-secret-${unique}`), "Provisioning preview leaked secret");

  const previewExport = assertJsonResponse(await request("/provisioning/preview/export", {
    method: "POST",
    token: admin.token,
    body: {
      deviceId: device.id,
      templateId: "huawei-vrp-bgp-customer",
      format: "markdown",
      parameters: {
        peerIp: "198.51.100.10",
        remoteAs: "65001",
        importPolicy: "RP-IN-SMOKE",
        exportPolicy: "RP-OUT-SMOKE",
        password: `preview-secret-${unique}`,
      },
      mode: "dry_run",
    },
  }), "POST /provisioning/preview/export");
  expect(previewExport.content?.includes("Nenhuma configuração foi aplicada"), "Provisioning export missing safety notice");

  console.log("Checking RBAC with viewer...");
  const viewerEmail = `viewer-${unique}@example.invalid`;
  const viewerPassword = `viewer-password-${unique}`;
  const viewerUser = assertJsonResponse(await request("/users", {
    method: "POST",
    token: admin.token,
    body: {
      name: `Viewer ${unique}`,
      email: viewerEmail,
      password: viewerPassword,
      role: "viewer",
      enabled: true,
    },
  }), "create viewer user");
  expect(Number.isInteger(viewerUser.id), "Viewer user id missing");

  const viewer = await login(viewerEmail, viewerPassword);
  const viewerGroups = await request("/connectors/groups", { token: viewer.token });
  assert.equal(viewerGroups.response.status, 200, "Viewer should read connector groups");
  const viewerWrite = await request("/connectors/groups", {
    method: "POST",
    token: viewer.token,
    body: {
      tenant_id: tenant.id,
      name: `Viewer Group ${unique}`,
      strategy: "ACTIVE_PASSIVE",
    },
  });
  assert.equal(viewerWrite.response.status, 403, "Viewer write access should be denied");

  console.log("Checking secret hardening...");
  const connectorConfig = assertJsonResponse(await request(`/connectors/${connector.id}/wireguard/config`, {
    token: admin.token,
  }), "GET /connectors/:id/wireguard/config");
  expect(!("connector_private_key" in connectorConfig), "WireGuard private key should not be exposed");
  expect(typeof connectorConfig.config === "string" && connectorConfig.config.includes("<PRIVATE_KEY>"), "WireGuard config preview should keep the placeholder");

  const healthSummaryAfter = assertJsonResponse(await request("/connectors/health/summary", { token: admin.token }), "GET /connectors/health/summary");
  expect(typeof healthSummaryAfter.openAlerts === "number", "Health summary openAlerts missing");

  expect(notificationSettings.telegram_bot_token_configured === true, "Notification settings not persisted");
  expect(!JSON.stringify(notificationSettings).includes(`telegram-bot-token-${unique}`), "Telegram token leaked");

  console.log("Smoke passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

#!/usr/bin/env node
/** H3.2A-retry — resolver precheck from DB (no value in stdout). */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resolverPath = path.join(
  root,
  "workspace/artifacts/api-server/src/modules/netops/snmp/snmp-credential-resolver.ts",
);

const { resolveSnmpCredential, describeSnmpCredentialResolution } = await import(resolverPath);

const pgRequire = createRequire(
  path.join(root, "workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg/package.json"),
);
const { Pool } = pgRequire("pg/lib/index.js");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(
  "SELECT id, hostname, snmp_community FROM devices WHERE id = 1",
  [],
);
await pool.end();

const device = rows[0];
if (!device) {
  console.log(JSON.stringify({ ok: false, error: "device_not_found" }));
  process.exit(1);
}

const resolved = resolveSnmpCredential({
  device: { snmpCommunity: device.snmp_community ?? null },
  env: { snmpCommunity: null, labFallbackAllowed: false },
  nodeEnv: process.env.NODE_ENV ?? "production",
});
const described = describeSnmpCredentialResolution(resolved);

const out = {
  deviceId: device.id,
  hostname: device.hostname,
  available: resolved.available,
  length: resolved.length,
  source: resolved.source,
  describedHasValue: Object.prototype.hasOwnProperty.call(described, "value"),
  errorCode: described.errorCode ?? null,
};

console.log(JSON.stringify(out, null, 2));
if (!resolved.available || resolved.length <= 0) process.exit(2);
if (described.value !== undefined) process.exit(3);
const allowedSources = ["device", "device_profile", "tenant_profile", "credential_profile"];
if (!allowedSources.includes(resolved.source)) process.exit(4);
process.exit(0);

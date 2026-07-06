#!/usr/bin/env node
/** Read-only SSH via NetOps connector (ESM). Run inside netops-api container. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pg = require("pg");
import { executeSshCommandForDevice } from "../src/modules/connectors/connector-execution.service.ts";

const deviceArg = process.argv[2];
const command = process.argv.slice(3).join(" ").trim();
if (!deviceArg || !command) {
  console.error('Usage: node run-device-ssh.mjs <device_id> "<display command>"');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const deviceId = Number(deviceArg);
const q = Number.isInteger(deviceId)
  ? "SELECT * FROM devices WHERE id = $1"
  : "SELECT * FROM devices WHERE hostname = $1";
const { rows } = await client.query(q, [Number.isInteger(deviceId) ? deviceId : deviceArg]);
await client.end();

if (!rows[0]) {
  console.error("Device not found:", deviceArg);
  process.exit(1);
}

const row = rows[0];
const device = {
  id: row.id,
  hostname: row.hostname,
  ipAddress: row.ip_address,
  vendor: row.vendor,
  platform: row.platform,
  sshPort: row.ssh_port,
  username: row.username,
  passwordEncrypted: row.password_encrypted,
  site: row.site,
  role: row.role,
  groupId: row.group_id,
  connectorGroupId: row.connector_group_id,
  connectorId: row.connector_id,
  snmpCommunity: row.snmp_community,
  netboxDeviceId: row.netbox_device_id,
  lastSeen: row.last_seen,
  status: row.status,
  complianceProfileName: row.compliance_profile_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
};

console.error(`# device=${device.hostname} ip=${device.ipAddress} cmd=${command}`);
const result = await executeSshCommandForDevice(device, command, { timeoutSeconds: 120 });
process.stdout.write(result.stdout || "");
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.success ? 0 : 1);

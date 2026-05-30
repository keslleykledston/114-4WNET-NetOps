#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

const sshPolicy = read("workspace/artifacts/api-server/src/modules/connectors/ssh-readonly-policy.ts");
const mask = read("workspace/artifacts/api-server/src/modules/connectors/connector-payload-mask.ts");
const execution = read("workspace/artifacts/api-server/src/modules/connectors/connector-execution.service.ts");
const migration = read("workspace/lib/db/migrations/0021_connector_jobs_phase4.sql");
const devicesRoute = read("workspace/artifacts/api-server/src/routes/devices.ts");
const snmpFast = read("workspace/artifacts/api-server/src/modules/operational/snmp-fast-interfaces.service.ts");

assert.match(migration, /device_id/);
assert.match(migration, /correlation_id/);
assert.match(migration, /masked_payload_json/);

assert.match(sshPolicy, /system-view/);
assert.match(sshPolicy, /configure/);
assert.match(sshPolicy, /&&/);
assert.match(execution, /waitForJobResult/);
assert.match(execution, /executeSshCommand/);
assert.match(execution, /executeSnmpWalk/);
assert.match(execution, /ConnectorOfflineError/);
assert.match(mask, /\[redacted\]/);

assert.match(devicesRoute, /deviceUsesConnector/);
assert.match(devicesRoute, /\/devices\/:id\/diagnostics/);
assert.match(devicesRoute, /connectorId/);

assert.match(snmpFast, /collectSnmpInterfacesViaConnector/);

console.log("connectors-phase4-selftest: 11 checks OK");

#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

const autoCollect = read("workspace/artifacts/api-server/src/modules/connectors/connector-auto-collect.service.ts");
const devicesRoute = read("workspace/artifacts/api-server/src/routes/devices.ts");
const deviceDetail = read("workspace/artifacts/netops-manager/src/pages/device-detail.tsx");
const devicesPage = read("workspace/artifacts/netops-manager/src/pages/devices.tsx");
const snmpFast = read("workspace/artifacts/api-server/src/modules/operational/snmp-fast-interfaces.service.ts");
const mask = read("workspace/artifacts/api-server/src/modules/connectors/connector-payload-mask.ts");

assert.match(autoCollect, /export async function enqueuePostSshSuccessCollections/);
assert.match(autoCollect, /enqueueSshConfigBundleForDevice/);
assert.match(autoCollect, /collectSnmpFastInterfaces/);
assert.match(autoCollect, /snmpCommunity/);
assert.match(autoCollect, /status: "skipped"/);
assert.match(autoCollect, /setImmediate/);
assert.match(autoCollect, /connector_post_ssh_autocollect/);

assert.match(devicesRoute, /enqueuePostSshSuccessCollections/);
assert.match(devicesRoute, /buildCollectMessage/);
assert.match(devicesRoute, /collection-status/);
assert.match(devicesRoute, /getDeviceCollectionStatus/);
assert.match(devicesRoute, /SNMP_FAST enfileirado/);

assert.match(deviceDetail, /Coleta via Connector/);
assert.match(deviceDetail, /collection-status/);
assert.match(deviceDetail, /parserStatus/);

assert.match(devicesPage, /sshConfigBundle/);
assert.match(devicesPage, /snmpFast/);
assert.match(devicesPage, /coleta completa enfileirada/);

assert.match(snmpFast, /collectSnmpInterfacesViaConnector|SNMP_FAST|connector/i);

assert.match(mask, /password.*redacted|redacted.*password/i);

console.log("connectors-post-ssh-autocollect-selftest: 19 checks OK");

#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

const sshCollector = read("workspace/artifacts/api-server/src/modules/netops/device-discovery/collectors/ssh.collector.ts");
const snmpCollector = read("workspace/artifacts/api-server/src/modules/netops/device-discovery/collectors/snmp.collector.ts");
const connectorSnmp = read("workspace/artifacts/api-server/src/modules/connectors/connector-snmp-collect.ts");

const discoveryController = read("workspace/artifacts/api-server/src/modules/netops/device-discovery/discovery.controller.ts");
const discoveryRoutes = read("workspace/artifacts/api-server/src/modules/netops/device-discovery/discovery.routes.ts");

assert.match(sshCollector, /loadLatestConnectorBundle|connector_ssh_bundle/);
assert.match(snmpCollector, /collectSnmpReadonlyViaConnector/);
assert.match(discoveryController, /enqueueDeviceDiscovery/);
assert.match(discoveryRoutes, /discovery-status/);

console.log("connectors-discovery-selftest: 4 checks OK");

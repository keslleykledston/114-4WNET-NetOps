#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const service = readFileSync(
  path.join(root, "workspace/artifacts/api-server/src/modules/l2circuits/operational-refresh/l2-operational-refresh.service.ts"),
  "utf8",
);

assert.match(service, /collectOptionalSnmpForL2Refresh/);
assert.match(service, /refresh continua só com SSH/);
assert.doesNotMatch(service, /throw new L2OperationalSnmpDisabledError\(\)/);
assert.doesNotMatch(service, /throw new SnmpCredentialsNotConfiguredError\(deviceId\)/);
assert.match(service, /SNMP preflight\/collection falhou — refresh continua/);

console.log("l2-operational-refresh-snmp-optional-selftest: 5 checks OK");

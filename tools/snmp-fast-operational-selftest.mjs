#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { computeFreshnessStatus, freshnessExpiresAt } = await import(
  path.join(root, "workspace/artifacts/api-server/src/modules/operational/freshness.ts")
);
const {
  getSnmpFastPilotDeviceIds,
  assertSnmpFastPilotDevice,
  isSnmpFastPilotAllowlistEnforced,
  OperationalPilotError,
} = await import(
  path.join(root, "workspace/artifacts/api-server/src/modules/operational/pilot.ts")
);
const { checkSnmpFastRateLimit, recordSnmpFastCollect } = await import(
  path.join(root, "workspace/artifacts/api-server/src/modules/operational/rate-limit.ts")
);
const { mapSnmpInterfaceToOperationalRow } = await import(
  path.join(root, "workspace/artifacts/api-server/src/modules/operational/operational-interface-mapper.ts")
);
const { SnmpCredentialsNotConfiguredError } = await import(
  path.join(root, "workspace/artifacts/api-server/src/modules/operational/operational-errors.ts")
);

const now = new Date("2026-05-26T12:00:00Z");
assert.equal(computeFreshnessStatus(new Date(now.getTime() - 4 * 60 * 1000), now), "fresh");
assert.equal(computeFreshnessStatus(new Date(now.getTime() - 30 * 60 * 1000), now), "stale");
assert.equal(computeFreshnessStatus(new Date(now.getTime() - 2 * 60 * 60 * 1000), now), "expired");
assert.equal(computeFreshnessStatus(null, now), "unknown");

const exp = freshnessExpiresAt(now);
assert.ok(exp.getTime() > now.getTime());

process.env.SNMP_FAST_PILOT_DEVICE_IDS = "1";
assert.equal(isSnmpFastPilotAllowlistEnforced(), true);
assert.ok(getSnmpFastPilotDeviceIds().has(1));
assert.throws(() => assertSnmpFastPilotDevice(99), OperationalPilotError);

process.env.SNMP_FAST_PILOT_DEVICE_IDS = "*";
assert.equal(isSnmpFastPilotAllowlistEnforced(), false);
assert.doesNotThrow(() => assertSnmpFastPilotDevice(2));
assert.doesNotThrow(() => assertSnmpFastPilotDevice(99));

assert.ok(checkSnmpFastRateLimit(1).allowed);
recordSnmpFastCollect(1);
assert.ok(!checkSnmpFastRateLimit(1).allowed);

const collectedAt = new Date("2026-05-26T12:00:00Z");
const row = mapSnmpInterfaceToOperationalRow(
  1,
  42,
  {
    ifIndex: 5,
    name: "GigabitEthernet0/0/1",
    description: "UPLINK",
    alias: "CORE",
    rawDescr: "GigabitEthernet0/0/1",
    adminStatus: "up",
    operStatus: "up",
    type: 6,
    mtu: 1500,
    speed: 1_000_000_000,
    highSpeedMbps: 1000,
    lastChangeTicks: 12345,
    mac: null,
    inOctets: 999,
    outOctets: 888,
  },
  collectedAt,
  "fresh",
);

assert.equal(row.deviceId, 1);
assert.equal(row.collectionJobId, 42);
assert.equal(row.ifIndex, 5);
assert.equal(row.ifName, "GigabitEthernet0/0/1");
assert.equal(row.ifHighSpeedMbps, 1000);
assert.equal(row.ifLastChangeTicks, 12345);
assert.equal(row.hcInOctets, 999n);
assert.equal(row.hcOutOctets, 888n);
assert.equal(row.source, "snmp");
assert.equal(row.adminStatus, "up");

const credErr = new SnmpCredentialsNotConfiguredError(1);
assert.equal(credErr.errorCode, "SNMP_CREDENTIALS_NOT_CONFIGURED");
assert.equal(SnmpCredentialsNotConfiguredError.code, "SNMP_CREDENTIALS_NOT_CONFIGURED");
assert.ok(!JSON.stringify(credErr).includes("community"));

console.log(JSON.stringify({ ok: true, tests: ["freshness", "pilot", "rate-limit", "mapper", "credentials-error"] }, null, 2));
console.log("snmp-fast-operational-selftest: PASS");

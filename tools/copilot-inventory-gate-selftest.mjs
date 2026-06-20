#!/usr/bin/env node
import assert from "node:assert/strict";

function parseBoolean(value, defaultValue) {
  if (value === undefined) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function isCopilotInventoryRefreshEnabled(env = process.env) {
  return parseBoolean(env.NETOPS_COPILOT_INVENTORY_REFRESH_ENABLED, false);
}

function isSnmpRealEnabled(env = process.env) {
  return env.NETOPS_SNMP_REAL_ENABLED?.trim().toLowerCase() === "true";
}

delete process.env.NETOPS_COPILOT_INVENTORY_REFRESH_ENABLED;
assert.equal(isCopilotInventoryRefreshEnabled(), false);

process.env.NETOPS_COPILOT_INVENTORY_REFRESH_ENABLED = "true";
assert.equal(isCopilotInventoryRefreshEnabled(), true);

delete process.env.NETOPS_SNMP_REAL_ENABLED;
assert.equal(isSnmpRealEnabled(), false);

process.env.NETOPS_SNMP_REAL_ENABLED = "true";
assert.equal(isSnmpRealEnabled(), true);

console.log("copilot-inventory-gate-selftest: PASS");

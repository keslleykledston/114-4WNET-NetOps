#!/usr/bin/env node
import assert from "node:assert/strict";

function parseBoolean(value, defaultValue) {
  if (value === undefined) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function isCopilotNetboxEnabled(env = process.env) {
  return parseBoolean(env.NETOPS_COPILOT_NETBOX_ENABLED, false);
}

delete process.env.NETOPS_COPILOT_NETBOX_ENABLED;
assert.equal(isCopilotNetboxEnabled(), false);

process.env.NETOPS_COPILOT_NETBOX_ENABLED = "true";
assert.equal(isCopilotNetboxEnabled(), true);

console.log("copilot-netbox-gate-selftest: PASS");

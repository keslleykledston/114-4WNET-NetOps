#!/usr/bin/env node
import assert from "node:assert/strict";

function parseBoolean(value, defaultValue) {
  if (value === undefined) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function isCopilotSshOnDemandEnabled(env = process.env) {
  return parseBoolean(env.NETOPS_COPILOT_SSH_ON_DEMAND_ENABLED, false);
}

delete process.env.NETOPS_COPILOT_SSH_ON_DEMAND_ENABLED;
assert.equal(isCopilotSshOnDemandEnabled(), false);

process.env.NETOPS_COPILOT_SSH_ON_DEMAND_ENABLED = "true";
assert.equal(isCopilotSshOnDemandEnabled(), true);

console.log("copilot-ssh-gate-selftest: PASS");

#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const {
  BGP_PREFLIGHT_OIDS,
  classifyBgpPreflightError,
  getBgpPreflightOptions,
  runBgpPreflightOffline,
  SNMP_PREFLIGHT_AUTH_CODE,
  SNMP_PREFLIGHT_TIMEOUT_CODE,
  SNMP_BGP_UNAVAILABLE_CODE,
} = await import(
  path.join(root, "workspace/artifacts/api-server/src/modules/operational-bgp/operational-bgp.preflight.ts")
);

assert.equal(BGP_PREFLIGHT_OIDS.sysDescr, "1.3.6.1.2.1.1.1.0");
assert.equal(BGP_PREFLIGHT_OIDS.bgpVersion, "1.3.6.1.2.1.15.1.1.0");

process.env.SNMP_FAST_BGP_PREFLIGHT_TIMEOUT_MS = "3500";
process.env.SNMP_FAST_BGP_PREFLIGHT_RETRIES = "0";
const opts = getBgpPreflightOptions();
assert.equal(opts.timeoutMs, 3500);
assert.equal(opts.retries, 0);

assert.equal(classifyBgpPreflightError("Request timed out").errorCode, SNMP_PREFLIGHT_TIMEOUT_CODE);
assert.equal(classifyBgpPreflightError("authorizationError").errorCode, SNMP_PREFLIGHT_AUTH_CODE);
assert.equal(classifyBgpPreflightError("bgp unavailable on agent").errorCode, SNMP_BGP_UNAVAILABLE_CODE);

const offline = runBgpPreflightOffline();
assert.equal(offline.ok, true);
assert.equal(offline.offline, true);

console.log("snmp-fast-bgp-preflight-selftest: PASS");

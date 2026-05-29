#!/usr/bin/env node
/**
 * H2.1E — SNMP sysDescr preflight selftest (mock only, no real SNMP/SSH).
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { collectSnmpInterfacesOnly } = await import(
  path.join(root, "workspace/artifacts/api-server/src/modules/netops/snmp/collect.ts")
);
const {
  SNMP_PREFLIGHT_TIMEOUT_CODE,
  SNMP_PREFLIGHT_AUTH_CODE,
  SNMP_PREFLIGHT_TIMEOUT_SUMMARY,
  runSnmpPreflight,
} = await import(
  path.join(root, "workspace/artifacts/api-server/src/modules/netops/snmp/snmp-preflight.ts")
);

const TEST_COMMUNITY = "pilot-secret-community-do-not-log";
const device = {
  id: 1,
  ipAddress: "203.0.113.10",
  hostname: "TEST-RTR",
  snmpCommunity: TEST_COMMUNITY,
};

async function captureConsole(fn) {
  const lines = [];
  const origWarn = console.warn;
  const origLog = console.log;
  const origError = console.error;
  const capture = (...args) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  console.warn = capture;
  console.log = capture;
  console.error = capture;
  try {
    return { lines, result: await fn() };
  } finally {
    console.warn = origWarn;
    console.log = origLog;
    console.error = origError;
  }
}

function assertNoCommunityInText(text, label) {
  assert.ok(!text.includes(TEST_COMMUNITY), `${label} must not contain community`);
  assert.ok(!text.toLowerCase().includes("community="), `${label} must not log community=`);
}

// --- runSnmpPreflight unit (mock session) ---
const timeoutSession = {
  close: () => {},
  get: (_oids, cb) => cb(new Error("Request timed out")),
  subtree: () => {},
};
const timeoutResult = await runSnmpPreflight(timeoutSession);
assert.equal(timeoutResult.ok, false);
if (!timeoutResult.ok) {
  assert.equal(timeoutResult.errorCode, SNMP_PREFLIGHT_TIMEOUT_CODE);
}

const authSession = {
  close: () => {},
  get: (_oids, cb) => cb(new Error("AuthorizationError: access denied")),
  subtree: () => {},
};
const authResult = await runSnmpPreflight(authSession);
assert.equal(authResult.ok, false);
if (!authResult.ok) {
  assert.equal(authResult.errorCode, SNMP_PREFLIGHT_AUTH_CODE);
}

const okSession = {
  close: () => {},
  get: (_oids, cb) => cb(null, [{ oid: "1.3.6.1.2.1.1.1.0", value: Buffer.from("Huawei VRP") }]),
  subtree: () => {},
};
const okPreflight = await runSnmpPreflight(okSession);
assert.equal(okPreflight.ok, true);

// A) preflight timeout → no IF-MIB
let ifMibCalls = 0;
const { lines: linesA, result: resultA } = await captureConsole(() =>
  collectSnmpInterfacesOnly(device, TEST_COMMUNITY, {
    runPreflight: async () => ({
      ok: false,
      reason: "timeout",
      message: "Request timed out",
      errorCode: SNMP_PREFLIGHT_TIMEOUT_CODE,
      elapsedMs: 42,
    }),
    collectInterfacesFn: async () => {
      ifMibCalls += 1;
      return { interfaces: [{ ifIndex: 1 }], ifMibDiagnostics: {} };
    },
  }),
);
const payloadA = resultA;
assert.equal(ifMibCalls, 0, "IF-MIB must not run when preflight times out");
assert.equal(payloadA.ifMibSkipped, true);
assert.equal(payloadA.errorCode, SNMP_PREFLIGHT_TIMEOUT_CODE);
assert.equal(payloadA.errorMessage, SNMP_PREFLIGHT_TIMEOUT_SUMMARY);
assert.equal(payloadA.interfaces.length, 0);
assert.ok(payloadA.preflightElapsedMs === 42);
linesA.forEach((line, i) => assertNoCommunityInText(line, `case A log[${i}]`));

// B) preflight auth → no IF-MIB
ifMibCalls = 0;
const payloadB = await collectSnmpInterfacesOnly(device, TEST_COMMUNITY, {
  runPreflight: async () => ({
    ok: false,
    reason: "auth",
    message: "AuthorizationError",
    errorCode: SNMP_PREFLIGHT_AUTH_CODE,
    elapsedMs: 18,
  }),
  collectInterfacesFn: async () => {
    ifMibCalls += 1;
    return { interfaces: [], ifMibDiagnostics: {} };
  },
});
assert.equal(ifMibCalls, 0, "IF-MIB must not run when preflight auth fails");
assert.equal(payloadB.ifMibSkipped, true);
assert.equal(payloadB.errorCode, SNMP_PREFLIGHT_AUTH_CODE);

// C) preflight OK → IF-MIB runs
ifMibCalls = 0;
const mockIface = {
  ifIndex: 10,
  name: "Eth0",
  description: null,
  alias: null,
  rawDescr: "Eth0",
  adminStatus: "up",
  operStatus: "up",
  type: 6,
  mtu: 1500,
  speed: 1_000_000_000,
  highSpeedMbps: 1000,
  lastChangeTicks: 0,
  mac: null,
  inOctets: 0,
  outOctets: 0,
  source: "snmp",
};
const payloadC = await collectSnmpInterfacesOnly(device, TEST_COMMUNITY, {
  runPreflight: async () => ({ ok: true, sysDescrPreview: "Huawei", elapsedMs: 5 }),
  collectInterfacesFn: async () => {
    ifMibCalls += 1;
    return { interfaces: [mockIface], ifMibDiagnostics: { ifDescr: { oid: "x", status: "ok", count: 1 } } };
  },
});
assert.equal(ifMibCalls, 1, "IF-MIB must run when preflight OK");
assert.equal(payloadC.ifMibSkipped, false);
assert.equal(payloadC.errorCode, null);
assert.equal(payloadC.interfaces.length, 1);

// D) logs on preflight fail path — no community
const { lines: linesD } = await captureConsole(() =>
  collectSnmpInterfacesOnly(device, TEST_COMMUNITY, {
    runPreflight: async () => ({
      ok: false,
      reason: "timeout",
      message: "Request timed out",
      errorCode: SNMP_PREFLIGHT_TIMEOUT_CODE,
      elapsedMs: 99,
    }),
  }),
);
const joinedD = linesD.join("\n");
assertNoCommunityInText(joinedD, "case D all logs");
assert.ok(joinedD.includes("preflight failed"), "expected preflight failed log");

console.log("snmp-fast-preflight-selftest: OK (A timeout abort, B auth abort, C IF-MIB on OK, D no community in logs)");

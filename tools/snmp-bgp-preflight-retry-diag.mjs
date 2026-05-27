#!/usr/bin/env node
/**
 * H3.2A-retry — BGP SNMP preflight only (sysDescr.0 + bgpVersion.0). No community in stdout.
 * Run inside netops-api: node /tmp/snmp-bgp-preflight-retry-diag.mjs
 */
import { createRequire } from "node:module";

const DEVICE_ID = Number(process.env.PILOT_DEVICE_ID ?? "1");
const TIMEOUT_MS = Number(process.env.SNMP_FAST_BGP_PREFLIGHT_TIMEOUT_MS ?? "4000");
const RETRIES = Number(process.env.SNMP_FAST_BGP_PREFLIGHT_RETRIES ?? "1");

const SYS_DESCR_OID = "1.3.6.1.2.1.1.1.0";
const BGP_VERSION_OID = "1.3.6.1.2.1.15.1.1.0";

const pgRequire = createRequire("/app/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg/package.json");
const { Pool } = pgRequire("pg/lib/index.js");
const snmp = createRequire("/app/workspace/node_modules/.pnpm/net-snmp@3.26.3/node_modules/net-snmp/package.json")("net-snmp");

function snmpGet(session, oid) {
  return new Promise((resolve, reject) => {
    session.get([oid], (error, varbinds) => {
      if (error) {
        reject(error);
        return;
      }
      const vb = varbinds?.[0];
      if (!vb) {
        resolve({ oid, value: null });
        return;
      }
      resolve({ oid: vb.oid, value: vb.value });
    });
  });
}

function decodePreview(value) {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return value.toString("utf8").replace(/\0/g, "").trim().slice(0, 80);
  return String(value).slice(0, 80);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    "SELECT id, hostname, ip_address, snmp_community FROM devices WHERE id = $1",
    [DEVICE_ID],
  );
  await pool.end();

  if (!rows[0]) {
    console.log(JSON.stringify({ ok: false, error: "device_not_found" }, null, 2));
    process.exit(1);
  }

  const device = rows[0];
  const ip = device.ip_address;
  const hasCred = Boolean(device.snmp_community?.trim());
  const credLen = device.snmp_community?.trim().length ?? 0;

  const out = {
    phase: "H3.2A-retry",
    deviceId: device.id,
    hostname: device.hostname,
    ipAddress: ip,
    snmpCredential: hasCred ? "yes" : "no",
    snmpCredentialLength: hasCred ? credLen : 0,
    credentialSource: hasCred ? "device" : "none",
    oids: { sysDescr: SYS_DESCR_OID, bgpVersion: BGP_VERSION_OID },
    timeoutMs: TIMEOUT_MS,
    retries: RETRIES,
    tests: {},
  };

  if (!hasCred) {
    out.conclusion = "NO_GO";
    out.reason = "SNMP credential missing — resolver would fail before SNMP";
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
  }

  const community = device.snmp_community.trim();
  const session = snmp.createSession(ip, community, {
    version: snmp.Version2c,
    timeout: TIMEOUT_MS,
    retries: RETRIES,
    idBitsSize: 32,
  });

  try {
    const t0 = Date.now();
    try {
      const vb = await snmpGet(session, SYS_DESCR_OID);
      out.tests.sysDescr = {
        oid: SYS_DESCR_OID,
        status: "ok",
        elapsedMs: Date.now() - t0,
        preview: decodePreview(vb.value),
      };
    } catch (err) {
      out.tests.sysDescr = {
        oid: SYS_DESCR_OID,
        status: "fail",
        elapsedMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
      out.conclusion = "NO_GO";
      out.reason = "sysDescr.0 failed — skip bgpVersion (no loop)";
      console.log(JSON.stringify(out, null, 2));
      process.exit(3);
    }

    const t1 = Date.now();
    try {
      const vb = await snmpGet(session, BGP_VERSION_OID);
      out.tests.bgpVersion = {
        oid: BGP_VERSION_OID,
        status: "ok",
        elapsedMs: Date.now() - t1,
        preview: decodePreview(vb.value),
      };
      out.conclusion = "GO";
      out.reason = "sysDescr and bgpVersion OK — H3.2B RFC4273 preflight unblocked";
    } catch (err) {
      out.tests.bgpVersion = {
        oid: BGP_VERSION_OID,
        status: "fail",
        elapsedMs: Date.now() - t1,
        error: err instanceof Error ? err.message : String(err),
      };
      out.conclusion = "PARTIAL";
      out.reason = "sysDescr OK, bgpVersion failed — SNMP path OK; BGP4-MIB may be unavailable";
      out.h32b = "NO_GO_RFC4273";
      out.fallback = "plan BGP4-V2 / Huawei MIB";
    }
  } finally {
    session.close();
  }

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.conclusion === "GO" ? 0 : out.conclusion === "PARTIAL" ? 4 : 5);
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(99);
});

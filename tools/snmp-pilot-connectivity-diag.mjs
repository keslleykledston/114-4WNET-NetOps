#!/usr/bin/env node
/**
 * H2.1D — minimal SNMP connectivity diag (device 1). No community in stdout.
 * Run inside netops-api container: node /tmp/snmp-pilot-connectivity-diag.mjs
 */
import { createRequire } from "node:module";
import { createConnection } from "node:net";

const DEVICE_ID = Number(process.env.PILOT_DEVICE_ID ?? "1");
const TARGET_IP = process.env.PILOT_IP; // optional override
const TIMEOUT_MS = Number(process.env.SNMP_DIAG_TIMEOUT_MS ?? "3000");
const RETRIES = Number(process.env.SNMP_DIAG_RETRIES ?? "0");

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
        resolve({ oid, value: null, type: "empty" });
        return;
      }
      resolve({ oid: vb.oid, value: vb.value, type: vb.type });
    });
  });
}

function decodeValue(value) {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return value.toString("utf8").replace(/\0/g, "").trim().slice(0, 120);
  return String(value).slice(0, 120);
}

async function udpProbe(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: timeoutMs });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, note: "tcp-connect-style probe timed out (UDP state inconclusive)" });
    }, timeoutMs);
    socket.on("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ ok: true, note: "socket connect() succeeded (not proof of SNMP; port is UDP)" });
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, note: err.message });
    });
  });
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    "SELECT id, hostname, ip_address, vendor, platform, snmp_community FROM devices WHERE id = $1",
    [DEVICE_ID],
  );
  await pool.end();

  if (!rows[0]) {
    console.log(JSON.stringify({ ok: false, error: "device_not_found" }, null, 2));
    process.exit(1);
  }

  const device = rows[0];
  const ip = TARGET_IP ?? device.ip_address;
  const hasCred = Boolean(device.snmp_community?.trim());
  const credLen = device.snmp_community?.trim().length ?? 0;

  const out = {
    phase: "H2.1D",
    deviceId: device.id,
    hostname: device.hostname,
    ipAddress: ip,
    vendor: device.vendor,
    platform: device.platform,
    snmpCredential: hasCred ? "yes" : "no",
    snmpCredentialLength: hasCred ? credLen : 0,
    netopsSnmpRealEnabled: process.env.NETOPS_SNMP_REAL_ENABLED ?? "unknown",
    tests: {},
  };

  out.tests.udp161 = await udpProbe(ip, 161, 2000);

  if (!hasCred) {
    out.conclusion = "NO_GO";
    out.reason = "SNMP credential missing on device";
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
    const sysDescrOid = "1.3.6.1.2.1.1.1.0";
    const t0 = Date.now();
    try {
      const vb = await snmpGet(session, sysDescrOid);
      out.tests.sysDescr = {
        oid: sysDescrOid,
        status: "ok",
        elapsedMs: Date.now() - t0,
        preview: decodeValue(vb.value),
      };
    } catch (err) {
      out.tests.sysDescr = {
        oid: sysDescrOid,
        status: "fail",
        elapsedMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
      out.conclusion = "NO_GO";
      out.reason = "sysDescr.0 failed — do not run IF-MIB full collect";
      out.nocChecks = [
        "ACL SNMP on NE (source = netops-api egress IP)",
        "community/profile match",
        "UDP/161 firewall host/docker",
        "return route to poller",
        "SNMPv2c enabled",
      ];
      console.log(JSON.stringify(out, null, 2));
      process.exit(3);
    }

    const ifNumberOid = "1.3.6.1.2.1.2.1.0";
    const t1 = Date.now();
    try {
      const vb = await snmpGet(session, ifNumberOid);
      out.tests.ifNumber = {
        oid: ifNumberOid,
        status: "ok",
        elapsedMs: Date.now() - t1,
        value: decodeValue(vb.value),
      };
    } catch (err) {
      out.tests.ifNumber = {
        oid: ifNumberOid,
        status: "fail",
        elapsedMs: Date.now() - t1,
        error: err instanceof Error ? err.message : String(err),
      };
      out.conclusion = "PARTIAL";
      out.reason = "sysDescr OK but ifNumber failed — IF-MIB ACL or view issue";
      console.log(JSON.stringify(out, null, 2));
      process.exit(4);
    }

    const ifNameOid = "1.3.6.1.2.1.31.1.1.1.1";
    const t2 = Date.now();
    try {
      const rowsMap = await new Promise((resolve, reject) => {
        const acc = {};
        let count = 0;
        session.subtree(ifNameOid, 5, (error, varbinds) => {
          const list = Array.isArray(error) ? error : varbinds;
          if (error && !Array.isArray(error) && error instanceof Error) {
            reject(error);
            return;
          }
          for (const vb of list ?? []) {
            if (count >= 5) break;
            const idx = vb.oid.split(".").pop();
            acc[idx] = decodeValue(vb.value);
            count += 1;
          }
        }, (error) => {
          if (error instanceof Error) reject(error);
          else resolve(acc);
        });
      });
      out.tests.ifNameSample = {
        oid: ifNameOid,
        status: "ok",
        elapsedMs: Date.now() - t2,
        sampleCount: Object.keys(rowsMap).length,
        indexes: Object.keys(rowsMap).slice(0, 5),
      };
      out.conclusion = "GO";
      out.reason = "Minimal SNMP path OK — safe to retry POST collect with long client timeout";
      out.retryCollect = {
        allowed: true,
        maxTimeSec: 600,
        deviceId: DEVICE_ID,
        note: "Set NETOPS_SNMP_REAL_ENABLED=true only for retry; rollback false after",
      };
    } catch (err) {
      out.tests.ifNameSample = {
        oid: ifNameOid,
        status: "fail",
        elapsedMs: Date.now() - t2,
        error: err instanceof Error ? err.message : String(err),
      };
      out.conclusion = "PARTIAL";
      out.reason = "sysDescr/ifNumber OK but ifName walk failed";
    }
  } finally {
    session.close();
  }

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.conclusion === "GO" ? 0 : 5);
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(99);
});

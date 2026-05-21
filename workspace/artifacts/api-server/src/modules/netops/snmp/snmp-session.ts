import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const snmp = require("net-snmp") as {
  Version2c: number;
  createSession: (target: string, community: string, options?: Record<string, unknown>) => SnmpSession;
};

export interface SnmpSession {
  close: () => void;
  subtree: (
    oid: string,
    maxRepetitions: number,
    feedCallback: (error: Error | null, varbinds?: SnmpVarbind[]) => void,
    doneCallback: (error: Error | null) => void,
  ) => void;
}

export interface SnmpVarbind {
  oid: string;
  type: number;
  value: unknown;
}

export function createSnmpSession(ipAddress: string, community: string, options?: { timeout?: number; retries?: number }): SnmpSession {
  return snmp.createSession(ipAddress, community, {
    version: snmp.Version2c,
    timeout: options?.timeout ?? 30000,
    retries: options?.retries ?? 3,
    idBitsSize: 32,
  });
}

export function snmpWalk(session: SnmpSession, columnOid: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, unknown> = {};

    session.subtree(columnOid, 20, (error, varbinds) => {
      const toProcess = Array.isArray(error) ? error : varbinds;
      if (error && !Array.isArray(error) && error instanceof Error) {
        reject(error);
        return;
      }

      for (const varbind of toProcess ?? []) {
        const index = indexFromOid(varbind.oid, columnOid);
        if (index) {
          rows[index] = varbind.value;
        }
      }
    }, (error) => {
      if (error instanceof Error) {
        reject(error);
      } else if (Array.isArray(error)) {
        // net-snmp may pass varbinds array in error param on success
        resolve(rows);
      } else if (error) {
        reject(new Error(String(error)));
      } else {
        resolve(rows);
      }
    });
  });
}

export interface OidWalkResult {
  oid: string;
  status: "ok" | "empty" | "timeout" | "noSuchObject" | "noSuchName" | "authFailure" | "accessDenied" | "unsupported" | "error";
  count: number;
  rows: Record<string, unknown>;
  error?: Error;
}

export async function snmpWalkWithDiagnostics(session: SnmpSession, columnOid: string): Promise<OidWalkResult> {
  try {
    const rows = await snmpWalk(session, columnOid);
    const count = Object.keys(rows).length;
    return {
      oid: columnOid,
      status: count === 0 ? "empty" : "ok",
      count,
      rows,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(`[SNMP-WALK-ERROR] OID ${columnOid}: ${message} (full: ${JSON.stringify(error)})`);
    let status: OidWalkResult["status"] = "error";

    if (message.includes("timeout") || message.includes("Timeout")) {
      status = "timeout";
    } else if (message.includes("noSuchObject")) {
      status = "noSuchObject";
    } else if (message.includes("noSuchName")) {
      status = "noSuchName";
    } else if (message.includes("authorizationError") || message.includes("authentication")) {
      status = "authFailure";
    } else if (message.includes("accessDenied") || message.includes("access denied")) {
      status = "accessDenied";
    } else if (message.includes("unsupported") || message.includes("Unsupported")) {
      status = "unsupported";
    }

    return {
      oid: columnOid,
      status,
      count: 0,
      rows: {},
      error: error instanceof Error ? error : new Error(message),
    };
  }
}

function indexFromOid(fullOid: string, columnOid: string): string | null {
  const prefix = `${columnOid}.`;
  if (!fullOid.startsWith(prefix)) return null;
  return fullOid.slice(prefix.length);
}

export function decodeSnmpString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Buffer.isBuffer(value)) {
    const utf8 = value.toString("utf8").replace(/\0/g, "").trim();
    return utf8.length > 0 ? utf8 : null;
  }
  return String(value);
}

export function decodeSnmpAddress(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) return trimmed;
    if (trimmed.includes(":")) return trimmed;
    if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length % 2 === 0) {
      return decodeHexAsciiIp(trimmed);
    }
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!Buffer.isBuffer(value)) return String(value);
  if (value.length === 4) return Array.from(value.values()).join(".");
  if (value.length === 16) {
    const groups: string[] = [];
    for (let index = 0; index < value.length; index += 2) {
      groups.push(value.readUInt16BE(index).toString(16));
    }
    return groups.join(":");
  }
  return value.toString("hex");
}

function decodeHexAsciiIp(hex: string): string | null {
  try {
    const decoded = Buffer.from(hex, "hex").toString("utf8").replace(/\0/g, "").trim();
    if (/^\d+\.\d+\.\d+\.\d+$/.test(decoded)) return decoded;
  } catch {
    return null;
  }
  return null;
}

export function decodeSnmpMac(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(trimmed)) return trimmed.toLowerCase();
    if (/^[0-9a-f]{12}$/i.test(trimmed)) {
      return trimmed.match(/.{1,2}/g)?.join(":").toLowerCase() ?? null;
    }
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!Buffer.isBuffer(value) || value.length === 0) return null;
  return Array.from(value.values()).map((byte) => byte.toString(16).padStart(2, "0")).join(":");
}

export function toSnmpNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function peerIpFromIndex(index: string): string {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(index)) return index;
  if (/^[0-9a-f]+$/i.test(index) && index.length % 2 === 0) {
    return decodeHexAsciiIp(index) ?? index;
  }
  const dotted = index.split(".").map((part) => Number(part));
  if (dotted.length === 4 && dotted.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return dotted.join(".");
  }
  return index;
}

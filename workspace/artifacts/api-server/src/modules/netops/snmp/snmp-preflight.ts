import type { Device } from "@workspace/db";
import { SNMP_OIDS } from "./oids.js";
import { createSnmpSession, decodeSnmpString, snmpGet, type SnmpSession } from "./snmp-session.js";

export const SNMP_PREFLIGHT_TIMEOUT_CODE = "SNMP_PREFLIGHT_TIMEOUT";
export const SNMP_PREFLIGHT_AUTH_CODE = "SNMP_PREFLIGHT_AUTH";
export const SNMP_PREFLIGHT_ERROR_CODE = "SNMP_PREFLIGHT_ERROR";

export const SNMP_PREFLIGHT_TIMEOUT_SUMMARY =
  "SNMP preflight timeout. Verifique UDP/161, ACL SNMP, community e source IP.";

export type SnmpPreflightFailureReason = "timeout" | "auth" | "error";

export type SnmpPreflightResult =
  | { ok: true; sysDescrPreview: string | null; elapsedMs: number }
  | { ok: false; reason: SnmpPreflightFailureReason; message: string; errorCode: string; elapsedMs: number };

export function getSnmpFastPreflightOptions(): { timeout: number; retries: number } {
  const timeout = Number(process.env["SNMP_FAST_PREFLIGHT_TIMEOUT_MS"] ?? 4000);
  const retries = Number(process.env["SNMP_FAST_PREFLIGHT_RETRIES"] ?? 1);
  const boundedTimeout = Number.isFinite(timeout) && timeout >= 3000 && timeout <= 5000
    ? timeout
    : Number.isFinite(timeout) && timeout > 0
      ? Math.min(5000, Math.max(3000, timeout))
      : 4000;
  const boundedRetries = Number.isFinite(retries) && retries >= 0 && retries <= 1 ? retries : 1;
  return {
    timeout: boundedTimeout,
    retries: boundedRetries,
  };
}

function classifyPreflightError(message: string): { reason: SnmpPreflightFailureReason; errorCode: string } {
  const lower = message.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { reason: "timeout", errorCode: SNMP_PREFLIGHT_TIMEOUT_CODE };
  }
  if (
    lower.includes("authorization")
    || lower.includes("authentication")
    || lower.includes("access denied")
    || lower.includes("accessdenied")
    || lower.includes("nosuchname")
    || lower.includes("no such name")
  ) {
    return { reason: "auth", errorCode: SNMP_PREFLIGHT_AUTH_CODE };
  }
  return { reason: "error", errorCode: SNMP_PREFLIGHT_ERROR_CODE };
}

export function preflightFailureSummary(errorCode: string): string {
  if (errorCode === SNMP_PREFLIGHT_TIMEOUT_CODE) return SNMP_PREFLIGHT_TIMEOUT_SUMMARY;
  if (errorCode === SNMP_PREFLIGHT_AUTH_CODE) {
    return "SNMP preflight auth/ACL failure. Verifique community, ACL SNMP e permissões MIB.";
  }
  return "SNMP preflight failed. Verifique conectividade SNMP ao dispositivo.";
}

/** Lightweight sysDescr.0 GET — no IF-MIB walks. */
export async function runSnmpPreflight(session: SnmpSession): Promise<SnmpPreflightResult> {
  const started = Date.now();
  const oid = SNMP_OIDS.sysDescr;
  try {
    const vb = await snmpGet(session, oid);
    const preview = decodeSnmpString(vb.value);
    return { ok: true, sysDescrPreview: preview, elapsedMs: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const { reason, errorCode } = classifyPreflightError(message);
    return { ok: false, reason, message, errorCode, elapsedMs: Date.now() - started };
  }
}

export async function runSnmpPreflightForDevice(
  device: Pick<Device, "id" | "ipAddress">,
  community: string,
): Promise<SnmpPreflightResult> {
  const opts = getSnmpFastPreflightOptions();
  const session = createSnmpSession(device.ipAddress, community, opts);
  try {
    return await runSnmpPreflight(session);
  } finally {
    session.close();
  }
}

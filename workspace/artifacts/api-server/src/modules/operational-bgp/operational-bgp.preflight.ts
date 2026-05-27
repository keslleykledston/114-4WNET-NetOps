/** BGP SNMP preflight OIDs (RFC4273) — no live walk in H3.1 stub mode. */
import { snmpGetPreflightOid } from "./operational-bgp-rfc4273-snmp.js";

export const BGP_PREFLIGHT_OIDS = {
  sysDescr: "1.3.6.1.2.1.1.1.0",
  bgpVersion: "1.3.6.1.2.1.15.1.1.0",
} as const;

export const SNMP_PREFLIGHT_TIMEOUT_CODE = "SNMP_PREFLIGHT_TIMEOUT";
export const SNMP_PREFLIGHT_AUTH_CODE = "SNMP_PREFLIGHT_AUTH";
export const SNMP_BGP_UNAVAILABLE_CODE = "SNMP_BGP_UNAVAILABLE";

export type BgpPreflightFailureReason = "timeout" | "auth" | "unavailable" | "error";

export type BgpPreflightResult =
  | { ok: true; offline: boolean; sysDescrOid: string; bgpVersionOid: string; elapsedMs: number }
  | {
      ok: false;
      offline: boolean;
      reason: BgpPreflightFailureReason;
      message: string;
      errorCode: string;
      elapsedMs: number;
    };

export function getBgpPreflightOptions(): { timeoutMs: number; retries: number } {
  const timeout = Number(process.env["SNMP_FAST_BGP_PREFLIGHT_TIMEOUT_MS"] ?? 4000);
  const retries = Number(process.env["SNMP_FAST_BGP_PREFLIGHT_RETRIES"] ?? 1);
  const boundedTimeout = Number.isFinite(timeout) && timeout >= 3000 && timeout <= 5000 ? timeout : 4000;
  const boundedRetries = Number.isFinite(retries) && retries >= 0 && retries <= 1 ? retries : 1;
  return { timeoutMs: boundedTimeout, retries: boundedRetries };
}

export function classifyBgpPreflightError(message: string): { reason: BgpPreflightFailureReason; errorCode: string } {
  const lower = message.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { reason: "timeout", errorCode: SNMP_PREFLIGHT_TIMEOUT_CODE };
  }
  if (
    lower.includes("authorization")
    || lower.includes("authentication")
    || lower.includes("access denied")
    || lower.includes("nosuchname")
  ) {
    return { reason: "auth", errorCode: SNMP_PREFLIGHT_AUTH_CODE };
  }
  if (lower.includes("bgp") && (lower.includes("unavailable") || lower.includes("no such"))) {
    return { reason: "unavailable", errorCode: SNMP_BGP_UNAVAILABLE_CODE };
  }
  return { reason: "error", errorCode: SNMP_BGP_UNAVAILABLE_CODE };
}

/** H3.1 offline — validates OID contract only; no UDP. */
export function runBgpPreflightOffline(): BgpPreflightResult {
  const started = Date.now();
  return {
    ok: true,
    offline: true,
    sysDescrOid: BGP_PREFLIGHT_OIDS.sysDescr,
    bgpVersionOid: BGP_PREFLIGHT_OIDS.bgpVersion,
    elapsedMs: Date.now() - started,
  };
}

/** Live preflight — sysDescr.0 + bgpVersion.0 before peer walks (H3.2B+). */
export async function runBgpPreflightLive(host: string, community: string): Promise<BgpPreflightResult> {
  const started = Date.now();
  const options = getBgpPreflightOptions();

  try {
    await snmpGetPreflightOid(host, community, BGP_PREFLIGHT_OIDS.sysDescr, options);
    await snmpGetPreflightOid(host, community, BGP_PREFLIGHT_OIDS.bgpVersion, options);
    return {
      ok: true,
      offline: false,
      sysDescrOid: BGP_PREFLIGHT_OIDS.sysDescr,
      bgpVersionOid: BGP_PREFLIGHT_OIDS.bgpVersion,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const { reason, errorCode } = classifyBgpPreflightError(message);
    return {
      ok: false,
      offline: false,
      reason,
      message,
      errorCode,
      elapsedMs: Date.now() - started,
    };
  }
}

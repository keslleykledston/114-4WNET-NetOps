export const SNMP_FAST_BGP_DISABLED = "SNMP_FAST_BGP_DISABLED";

export class SnmpFastBgpDisabledError extends Error {
  readonly statusCode = 503;
  readonly code = SNMP_FAST_BGP_DISABLED;
  constructor() {
    super("NETOPS_SNMP_BGP_REAL_ENABLED is false — SNMP_FAST BGP collection disabled.");
    this.name = "SnmpFastBgpDisabledError";
  }
}

export class OperationalBgpPreflightError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(errorCode: string, message: string) {
    super(message);
    this.name = "OperationalBgpPreflightError";
    this.code = errorCode;
    this.statusCode = errorCode === "SNMP_PREFLIGHT_TIMEOUT" ? 504 : errorCode === "SNMP_PREFLIGHT_AUTH" ? 403 : 422;
  }
}

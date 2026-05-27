export const SNMP_FAST_BGP_DISABLED = "SNMP_FAST_BGP_DISABLED";

export class SnmpFastBgpDisabledError extends Error {
  readonly statusCode = 503;
  readonly code = SNMP_FAST_BGP_DISABLED;
  constructor() {
    super("NETOPS_SNMP_BGP_REAL_ENABLED is false — SNMP_FAST BGP collection disabled.");
    this.name = "SnmpFastBgpDisabledError";
  }
}

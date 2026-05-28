export const L2_OPERATIONAL_REFRESH_DISABLED = "L2_OPERATIONAL_REFRESH_DISABLED";
export const L2_OPERATIONAL_SNMP_DISABLED = "L2_OPERATIONAL_SNMP_DISABLED";

export class L2OperationalRefreshDisabledError extends Error {
  readonly code = L2_OPERATIONAL_REFRESH_DISABLED;
  constructor() {
    super("L2_OPERATIONAL_REFRESH_ENABLED is false — operational L2 refresh disabled.");
    this.name = "L2OperationalRefreshDisabledError";
  }
}

export class L2OperationalSnmpDisabledError extends Error {
  readonly code = L2_OPERATIONAL_SNMP_DISABLED;
  constructor() {
    super("NETOPS_SNMP_REAL_ENABLED is false — SNMP_FAST L2 refresh disabled.");
    this.name = "L2OperationalSnmpDisabledError";
  }
}

export function isNetopsSnmpBgpRealEnabled(): boolean {
  const raw = process.env["NETOPS_SNMP_BGP_REAL_ENABLED"]?.trim().toLowerCase();
  if (!raw) return false;
  return ["1", "true", "yes", "on"].includes(raw);
}

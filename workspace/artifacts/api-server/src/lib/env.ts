function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export const env = {
  configApplyEnabled: parseBoolean(process.env["CONFIG_APPLY_ENABLED"], false),
  dryRunDefault: parseBoolean(process.env["DRY_RUN_DEFAULT"], true),
  netboxEnabled: parseBoolean(process.env["NETBOX_ENABLED"], false),
  netboxUrl: process.env["NETBOX_URL"]?.trim() || null,
  netboxToken: process.env["NETBOX_TOKEN"]?.trim() || null,
  netboxSkipTlsVerify: parseBoolean(process.env["NETBOX_SKIP_TLS_VERIFY"], false),
  netboxTimeoutMs: Number.parseInt(process.env["NETBOX_TIMEOUT_MS"] ?? "", 10) || 10000,
  netboxPageSize: Number.parseInt(process.env["NETBOX_PAGE_SIZE"] ?? "", 10) || 100,
  adminEmail: process.env["ADMIN_EMAIL"]?.trim() || null,
  adminPassword: process.env["ADMIN_PASSWORD"]?.trim() || null,
  adminName: process.env["ADMIN_NAME"]?.trim() || "Admin",
  bgpDrilldownSshDetailEnabled: parseBoolean(process.env["BGP_DRILLDOWN_SSH_DETAIL_ENABLED"], false),
};

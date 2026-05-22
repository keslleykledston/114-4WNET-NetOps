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
  adminEmail: process.env["ADMIN_EMAIL"]?.trim() || null,
  adminPassword: process.env["ADMIN_PASSWORD"]?.trim() || null,
  adminName: process.env["ADMIN_NAME"]?.trim() || "Admin",
};

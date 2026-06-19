function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export const env = {
  sessionSecret: process.env["SESSION_SECRET"]?.trim() || "netops-default-secret-key-32bytes",
  configApplyEnabled: parseBoolean(process.env["CONFIG_APPLY_ENABLED"], false),
  provisioningExecuteEnabled: parseBoolean(process.env["PROVISIONING_EXECUTE_ENABLED"], false),
  provisioningPreviewEnabled: parseBoolean(process.env["PROVISIONING_PREVIEW_ENABLED"], true),
  provisioningApplyEnabled: parseBoolean(process.env["PROVISIONING_APPLY_ENABLED"], false),
  provisioningRollbackEnabled: parseBoolean(process.env["PROVISIONING_ROLLBACK_ENABLED"], false),
  provisioningRequireApproval: parseBoolean(process.env["PROVISIONING_REQUIRE_APPROVAL"], true),
  provisioningDryRunDefault: parseBoolean(process.env["PROVISIONING_DRY_RUN_DEFAULT"], true),
  dryRunDefault: parseBoolean(process.env["DRY_RUN_DEFAULT"], true),
  systemUpdateEnabled: parseBoolean(process.env["SYSTEM_UPDATE_ENABLED"], true),
  systemUpdateChannel: process.env["SYSTEM_UPDATE_CHANNEL"]?.trim() || "stable",
  systemUpdateGitRemote: process.env["SYSTEM_UPDATE_GIT_REMOTE"]?.trim() || "origin",
  systemUpdateGitBranch: process.env["SYSTEM_UPDATE_GIT_BRANCH"]?.trim() || "main",
  systemUpdateGithubRepo: process.env["SYSTEM_UPDATE_GITHUB_REPO"]?.trim() || null,
  systemUpdateRequireCleanTree: parseBoolean(process.env["SYSTEM_UPDATE_REQUIRE_CLEAN_TREE"], true),
  systemUpdateBackupDir: process.env["SYSTEM_UPDATE_BACKUP_DIR"]?.trim() || "/var/backups/4wnet-netops",
  systemUpdateLockTtlSeconds: Number.parseInt(process.env["SYSTEM_UPDATE_LOCK_TTL_SECONDS"] ?? "", 10) || 1800,
  systemUpdateStepTimeoutSeconds: Number.parseInt(process.env["SYSTEM_UPDATE_STEP_TIMEOUT_SECONDS"] ?? "", 10) || 600,
  systemUpdateHealthcheckTimeoutSeconds: Number.parseInt(process.env["SYSTEM_UPDATE_HEALTHCHECK_TIMEOUT_SECONDS"] ?? "", 10) || 180,
  systemUpdateAllowManualRollback: parseBoolean(process.env["SYSTEM_UPDATE_ALLOW_MANUAL_ROLLBACK"], true),
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
  bgpDrilldownCacheTtlSeconds: Number.parseInt(process.env["BGP_DRILLDOWN_CACHE_TTL_SECONDS"] ?? "", 10) || 7 * 24 * 60 * 60,
};

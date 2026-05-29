export function isL2OperationalRefreshEnabled(): boolean {
  return process.env["L2_OPERATIONAL_REFRESH_ENABLED"]?.trim().toLowerCase() === "true";
}

export function isL2OperationalRefreshSshConfigEnabled(): boolean {
  return process.env["L2_OPERATIONAL_REFRESH_SSH_CONFIG"]?.trim().toLowerCase() === "true";
}

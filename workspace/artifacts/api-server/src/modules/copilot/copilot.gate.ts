function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export function isCopilotEnabled(): boolean {
  return parseBoolean(process.env["NETOPS_COPILOT_ENABLED"], true);
}

export function assertCopilotEnabled():
  | { ok: true }
  | { ok: false; status: number; message: string } {
  if (!isCopilotEnabled()) {
    return {
      ok: false,
      status: 503,
      message: "Copiloto IA desabilitado (NETOPS_COPILOT_ENABLED=false).",
    };
  }
  return { ok: true };
}

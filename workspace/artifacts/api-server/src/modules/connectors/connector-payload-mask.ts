const SENSITIVE_KEYS = new Set([
  "password",
  "community",
  "private_key",
  "privateKey",
  "token",
  "secret",
  "psk",
  "auth_password",
  "priv_password",
  "snmpCommunity",
]);

const MASK = "[redacted]";

export function maskSensitivePayload(payload: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEYS.has(key)) {
      masked[key] = MASK;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      masked[key] = maskSensitivePayload(value as Record<string, unknown>);
      continue;
    }
    masked[key] = value;
  }
  return masked;
}

export function maskSensitiveCommand(command: string): string {
  return command.replace(/(password|community|secret)\s+\S+/gi, "$1 [redacted]");
}

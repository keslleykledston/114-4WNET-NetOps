const SECRET_PATTERNS = [
  /(password|passwd|secret|token|community)\s+\S+/gi,
  /(snmp-agent community)\s+\S+\s+\S+/gi,
  /(authorization:\s*token)\s+\S+/gi,
];

export function sanitizeEvidence(value: unknown, maxLength = 800): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? "");
  let sanitized = raw;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "$1 [REDACTED]");
  }
  return sanitized.slice(0, maxLength);
}

export function compactReference(value: unknown): string | null {
  const sanitized = sanitizeEvidence(value, 300);
  return sanitized.length > 0 ? sanitized : null;
}

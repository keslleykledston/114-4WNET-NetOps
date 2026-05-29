const MAX_L2_EVIDENCE_CHARS = 240;

export function redactL2Output(value: string): string {
  return value
    .replace(/(password|community|token|secret|private-key)\s*[:=]\s*\S+/gi, "$1=<redacted>")
    .replace(/snmp-agent\s+community\s+\S+/gi, "snmp-agent community <redacted>")
    .replace(/(cipher|simple)\s+\S+/gi, "$1 <redacted>");
}

export function truncateL2Evidence(value: string, maxChars = MAX_L2_EVIDENCE_CHARS): string {
  return redactL2Output(value).slice(0, maxChars);
}

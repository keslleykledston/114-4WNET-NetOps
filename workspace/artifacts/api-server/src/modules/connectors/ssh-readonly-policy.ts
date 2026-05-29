const BLOCKED_PATTERNS = [
  /\bconfigure\s+terminal\b/i,
  /\bsystem-view\b/i,
  /\bcommit\b/i,
  /\bsave\b/i,
  /\bdelete\b/i,
  /\breload\b/i,
  /\breboot\b/i,
  /\breset\b/i,
  /\bshutdown\b/i,
  /\bwrite\s+(mem|memory|startup)\b/i,
  /\bcopy\s+running-config\b/i,
];

const ALLOWED_PREFIXES = [
  /^display\s+/i,
  /^show\s+/i,
  /^ping(\s+|-)/i,
  /^tracert/i,
  /^traceroute/i,
];

export function assertReadOnlySshCommand(command: string): void {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error("SSH command is required");
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new Error(`SSH command blocked by read-only policy: ${pattern.source}`);
    }
  }
  const allowed = ALLOWED_PREFIXES.some((prefix) => prefix.test(trimmed));
  if (!allowed) {
    throw new Error("SSH command must start with display/show/ping/traceroute (read-only phase)");
  }
}

export function isReadOnlySshCommand(command: string): boolean {
  try {
    assertReadOnlySshCommand(command);
    return true;
  } catch {
    return false;
  }
}

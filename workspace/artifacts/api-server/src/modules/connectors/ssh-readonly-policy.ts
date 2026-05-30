const BLOCKED_PATTERNS = [
  /\bsystem-view\b/i,
  /\bconfigure\b/i,
  /\bconf\s+t\b/i,
  /\bcommit\b/i,
  /\bsave\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\breset\b/i,
  /\breboot\b/i,
  /\breload\b/i,
  /\bshutdown\b/i,
  /\bundo\b/i,
  /\bset\b/i,
  /\bedit\b/i,
  /\bcopy\b/i,
  /\bwrite\b/i,
  /\berase\b/i,
  /\bformat\b/i,
  /\bupgrade\b/i,
  /\binstall\b/i,
  /\brequest\s+system\b/i,
  /;/,
  /&&/,
  /\|\|/,
  /`/,
  /\$\(/,
  />/,
  /</,
  /\|/,
  /\bconfigure\s+terminal\b/i,
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

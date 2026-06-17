import { parseCircuitPolicyName } from "../parsers/circuit-policy.parser.js";

/** Extract circuit ID (two digits) from Cxx policy/filter/prefix-list naming conventions. */
export function extractCircuitIdFromName(name: string): string | null {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;

  const fromPolicy = parseCircuitPolicyName(trimmed);
  if (fromPolicy) return fromPolicy.circuitId;

  const direct = /^C(\d{2})(?:[-_]|$)/i.exec(trimmed);
  if (direct) return direct[1];

  const embedded = /\bC(\d{2})\b/i.exec(trimmed);
  return embedded ? embedded[1] : null;
}

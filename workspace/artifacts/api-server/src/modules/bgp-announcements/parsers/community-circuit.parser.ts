import type { ParsedCircuitCommunity } from "../bgp-announcement.types.js";

/** Matches 64777:5[CID][ACTION] — namespace 5, CID 2 digits, action 2 digits. */
const RE_CIRCUIT_COMMUNITY = /^(\d+):5(\d{2})(\d{2})$/;

export function parseCircuitCommunity(
  value: string,
  expectedBaseAsn = 64777,
): ParsedCircuitCommunity {
  const raw = (value || "").trim();
  const match = RE_CIRCUIT_COMMUNITY.exec(raw);
  if (!match) {
    return {
      raw,
      baseAsn: 0,
      namespace: "",
      circuitId: "",
      actionCode: "",
      valid: false,
    };
  }

  const baseAsn = Number(match[1]);
  const circuitId = match[2];
  const actionCode = match[3];

  return {
    raw,
    baseAsn,
    namespace: "5",
    circuitId,
    actionCode,
    valid: baseAsn === expectedBaseAsn && circuitId.length === 2 && actionCode.length === 2,
  };
}

export function buildCircuitCommunity(
  circuitId: string,
  actionCode: string,
  baseAsn = 64777,
): string {
  const cid = circuitId.padStart(2, "0").slice(-2);
  const action = actionCode.padStart(2, "0").slice(-2);
  return `${baseAsn}:5${cid}${action}`;
}

export function normalizeCommunityValues(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const v = value.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.sort();
}

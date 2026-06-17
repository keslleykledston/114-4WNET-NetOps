/** Global namespace communities: 64777:600[CODE] (non-circuit marking). */
const RE_GLOBAL_COMMUNITY = /^(\d+):600(\d{2})$/;

export interface ParsedGlobalCommunity {
  raw: string;
  baseAsn: number;
  namespace: "600";
  code: string;
  valid: boolean;
}

export function parseGlobalCommunity(value: string, expectedBaseAsn = 64777): ParsedGlobalCommunity {
  const raw = (value || "").trim();
  const match = RE_GLOBAL_COMMUNITY.exec(raw);
  if (!match) {
    return { raw, baseAsn: 0, namespace: "600", code: "", valid: false };
  }

  const baseAsn = Number(match[1]);
  const code = match[2];
  return {
    raw,
    baseAsn,
    namespace: "600",
    code,
    valid: baseAsn === expectedBaseAsn && code.length === 2,
  };
}

export function isGlobalCommunityNamespace(value: string): boolean {
  return parseGlobalCommunity(value).valid;
}

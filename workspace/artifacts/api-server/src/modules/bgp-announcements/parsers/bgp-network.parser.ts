import type { BgpNetworkStatement } from "../bgp-announcement.types.js";

const RE_NETWORK_V4 =
  /^network\s+(\d{1,3}(?:\.\d{1,3}){3})\s+(?:(\d{1,3}(?:\.\d{1,3}){3})\s+)?route-policy\s+(\S+)/i;
const RE_NETWORK_V6 =
  /^network\s+([0-9a-fA-F:/]+)\s+route-policy\s+(\S+)/i;

export function parseBgpNetworkStatements(configText: string): BgpNetworkStatement[] {
  const lines = (configText || "").replace(/\r/g, "").split("\n");
  const results: BgpNetworkStatement[] = [];
  const seen = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.toLowerCase().startsWith("network ")) continue;

    const v4 = RE_NETWORK_V4.exec(line);
    if (v4) {
      const addr = v4[1];
      const mask = v4[2];
      const policy = v4[3];
      let prefix = addr;
      if (mask) {
        const maskBits = maskToPrefix(mask);
        if (maskBits !== null) prefix = `${addr}/${maskBits}`;
      }
      const key = `ipv4|${prefix}|${policy}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ prefix, family: "ipv4", routePolicyName: policy, raw: line });
      }
      continue;
    }

    const v6 = RE_NETWORK_V6.exec(line);
    if (v6) {
      const prefix = v6[1];
      const policy = v6[2];
      const key = `ipv6|${prefix}|${policy}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ prefix, family: "ipv6", routePolicyName: policy, raw: line });
      }
    }
  }

  return results;
}

function maskToPrefix(mask: string): number | null {
  const parts = mask.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return null;
  let bits = 0;
  for (const p of parts) {
    if (p === 255) bits += 8;
    else if (p === 254) bits += 7;
    else if (p === 252) bits += 6;
    else if (p === 248) bits += 5;
    else if (p === 240) bits += 4;
    else if (p === 224) bits += 3;
    else if (p === 192) bits += 2;
    else if (p === 128) bits += 1;
    else if (p === 0) break;
    else return null;
  }
  return bits;
}

export interface ParsedBgpNetworkStatement {
  prefix: string;
  routePolicyName: string | null;
}

function maskToPrefixLength(mask: string): number | null {
  if (/^\d+$/.test(mask)) {
    const value = Number(mask);
    return Number.isInteger(value) && value >= 0 && value <= 128 ? value : null;
  }
  const parts = mask.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  const bits = parts
    .map((part) => part.toString(2).padStart(8, "0"))
    .join("");
  const firstZero = bits.indexOf("0");
  if (firstZero === -1) return 32;
  if (bits.slice(firstZero).includes("1")) return null;
  return firstZero;
}

export function parseBgpNetworkStatements(rawConfig: string): ParsedBgpNetworkStatement[] {
  const lines = rawConfig.split(/\r?\n/);
  const statements: ParsedBgpNetworkStatement[] = [];

  for (const line of lines) {
    const match = /^\s*network\s+(\S+)\s*(.*)$/i.exec(line);
    if (!match) continue;
    const prefix = match[1] ?? "";
    let remainder = (match[2] ?? "").trim();
    let routePolicyName: string | null = null;
    const routePolicyMatch = /\broute-policy\s+(\S+)\s*$/i.exec(remainder);
    if (routePolicyMatch?.[1]) {
      routePolicyName = routePolicyMatch[1];
      remainder = remainder.replace(/\broute-policy\s+\S+\s*$/i, "").trim();
    }
    const maskOrLength = remainder ? remainder.split(/\s+/)[0] ?? null : null;
    const cidr = maskOrLength ? maskToPrefixLength(maskOrLength) : null;
    statements.push({
      prefix: cidr != null ? `${prefix}/${cidr}` : prefix,
      routePolicyName,
    });
  }

  return statements;
}

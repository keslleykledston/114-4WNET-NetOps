export type HuaweiConfigBlockType =
  | "vpn-instance"
  | "route-policy"
  | "community-filter"
  | "prefix-list"
  | "bgp"
  | "interface"
  | "unknown";

export interface HuaweiConfigBlock {
  type: HuaweiConfigBlockType;
  header: string;
  lines: string[];
  raw: string;
  startLine: number;
  endLine: number;
}

function normalizeLines(config: string): string[] {
  return String(config ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
}

function firstNonEmptyLine(lines: string[]): string {
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export function classifyHuaweiConfigBlock(block: Pick<HuaweiConfigBlock, "header" | "lines">): HuaweiConfigBlockType {
  const header = block.header.trim() || firstNonEmptyLine(block.lines);
  if (!header) return "unknown";

  if (/^route-policy\s+\S+\s+(?:permit|deny)\s+node\s+\d+/i.test(header)) return "route-policy";
  if (/^ip\s+vpn-instance\s+\S+/i.test(header)) return "vpn-instance";
  if (/^interface\s+\S+/i.test(header)) return "interface";
  if (/^ip\s+community-filter\b/i.test(header) || block.lines.some((line) => /^\s*ip\s+community-filter\b/i.test(line))) return "community-filter";
  if (/^ip\s+(?:ip-)?prefix\b/i.test(header) || block.lines.some((line) => /^\s*ip\s+(?:ip-)?prefix\b/i.test(line))) return "prefix-list";
  if (/^bgp\b/i.test(header) || block.lines.some((line) => /^\s*bgp\b/i.test(line))) return "bgp";

  return "unknown";
}

export function splitHuaweiConfigBlocks(config: string): HuaweiConfigBlock[] {
  const lines = normalizeLines(config);
  const blocks: HuaweiConfigBlock[] = [];
  let currentLines: string[] = [];
  let startLine = 0;

  const flush = (endLine: number) => {
    if (currentLines.length === 0) return;
    const raw = currentLines.join("\n");
    const header = firstNonEmptyLine(currentLines);
    blocks.push({
      type: classifyHuaweiConfigBlock({ header, lines: currentLines }),
      header,
      lines: [...currentLines],
      raw,
      startLine,
      endLine,
    });
    currentLines = [];
    startLine = 0;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "#") {
      flush(index + 1);
      return;
    }

    if (currentLines.length === 0) startLine = index + 1;
    if (trimmed || currentLines.length > 0) {
      currentLines.push(line);
    }
  });

  flush(lines.length);
  return blocks;
}

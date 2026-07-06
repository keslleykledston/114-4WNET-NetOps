export type RaisecomConfigBlockType =
  | "interface"
  | "bgp"
  | "vlan"
  | "route-policy"
  | "unknown";

export interface RaisecomConfigBlock {
  type: RaisecomConfigBlockType;
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

export function classifyRaisecomConfigBlock(block: Pick<RaisecomConfigBlock, "header" | "lines">): RaisecomConfigBlockType {
  const header = block.header.trim() || firstNonEmptyLine(block.lines);
  if (!header) return "unknown";
  if (/^interface\s+\S+/i.test(header)) return "interface";
  if (/^router\s+bgp\b/i.test(header) || /^bgp\s+\d+/i.test(header)) return "bgp";
  if (/^vlan\s+\d+/i.test(header)) return "vlan";
  if (/^route-policy\s+\S+/i.test(header)) return "route-policy";
  return "unknown";
}

export function splitRaisecomConfigBlocks(config: string): RaisecomConfigBlock[] {
  const lines = normalizeLines(config);
  const blocks: RaisecomConfigBlock[] = [];
  let currentLines: string[] = [];
  let startLine = 0;

  const flush = (endLine: number) => {
    if (currentLines.length === 0) return;
    const header = firstNonEmptyLine(currentLines);
    blocks.push({
      type: classifyRaisecomConfigBlock({ header, lines: currentLines }),
      header,
      lines: [...currentLines],
      raw: currentLines.join("\n"),
      startLine,
      endLine,
    });
    currentLines = [];
    startLine = 0;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "!" || trimmed === "#") {
      flush(index + 1);
      return;
    }
    if (currentLines.length === 0) startLine = index + 1;
    if (trimmed || currentLines.length > 0) currentLines.push(line);
  });

  flush(lines.length);
  return blocks;
}

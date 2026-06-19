type VsiVplsConfigFocusOptions = {
  vsId?: string | null;
  vsiName?: string | null;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLines(block: string): string {
  return block
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function blockFirstKeyword(block: string): string | null {
  const first = block.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!first) return null;
  return first.split(/\s+/)[0]?.toLowerCase() ?? null;
}

function isVsiBlock(block: string): boolean {
  return ["vsi", "vpls"].includes(blockFirstKeyword(block) ?? "");
}

function isVlanifBlock(block: string): boolean {
  return /^interface\s+vlanif\d+\b/i.test(block.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "");
}

function matchesSelectedVsiBlock(block: string, options: VsiVplsConfigFocusOptions): boolean {
  const vsId = options.vsId?.trim();
  const vsiName = options.vsiName?.trim();
  if (!vsId && !vsiName) return isVsiBlock(block);

  const normalized = normalizeLines(block);
  if (vsiName) {
    const namePattern = new RegExp(`^\\s*vsi\\s+${escapeRegex(vsiName)}\\b`, "im");
    if (namePattern.test(normalized)) return true;
  }

  if (vsId) {
    const idPattern = new RegExp(`^\\s*vsi[- ]?id\\s+${escapeRegex(vsId)}\\b`, "im");
    const bdPattern = new RegExp(`^\\s*bd[- ]?id\\s+${escapeRegex(vsId)}\\b`, "im");
    if (idPattern.test(normalized) || bdPattern.test(normalized)) return true;
  }

  return false;
}

function matchesBoundVlanifBlock(block: string, options: VsiVplsConfigFocusOptions): boolean {
  if (!isVlanifBlock(block)) return false;
  const normalized = normalizeLines(block);
  const vsiName = options.vsiName?.trim();
  const vsId = options.vsId?.trim();
  if (vsiName) {
    const namePattern = new RegExp(`^\\s*l2\\s+binding\\s+vsi\\s+${escapeRegex(vsiName)}\\b`, "im");
    if (namePattern.test(normalized)) return true;
  }
  if (vsId) {
    const idPattern = new RegExp(`^\\s*l2\\s+binding\\s+vsi[- ]?id\\s+${escapeRegex(vsId)}\\b`, "im");
    if (idPattern.test(normalized)) return true;
  }
  return false;
}

export function focusVsiVplsConfigText(rawConfig: string | null | undefined, options: VsiVplsConfigFocusOptions = {}): string | null {
  if (!rawConfig) return null;

  const blocks = rawConfig
    .split(/^\s*#\s*$/m)
    .map((block) => block.trim())
    .filter(Boolean);

  const selectedBlocks = blocks.filter((block) => matchesSelectedVsiBlock(block, options) || matchesBoundVlanifBlock(block, options));
  return selectedBlocks.length > 0 ? selectedBlocks.join("\n#\n") : null;
}

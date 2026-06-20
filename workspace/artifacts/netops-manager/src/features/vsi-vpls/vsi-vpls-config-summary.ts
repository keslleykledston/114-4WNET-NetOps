export type VsiVplsConfigBlockMode = "service" | "tagged" | "untagged";

export type VsiVplsConfigBlockSummary = {
  title: string;
  subtitle: string;
  mode: VsiVplsConfigBlockMode;
  raw: string;
  interfaceName: string | null;
};

export type VsiVplsTrafficDeliverySummary = {
  tagged: string[];
  untagged: string[];
  interfaces: string[];
  summaryText: string;
};

function splitConfigBlocks(rawConfig: string): string[] {
  return rawConfig
    .split(/\n#\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function firstMeaningfulLine(block: string): string {
  return block.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

function extractVlanifName(block: string): string | null {
  const match = firstMeaningfulLine(block).match(/^interface\s+(vlanif\d+)\b/i);
  return match?.[1] ?? null;
}

function extractServiceName(block: string): string | null {
  const match = firstMeaningfulLine(block).match(/^vsi\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function inferVlanifMode(interfaceName: string | null, vsId: string | null | undefined): VsiVplsConfigBlockMode {
  if (!interfaceName || !vsId) return "untagged";
  const suffix = interfaceName.replace(/^vlanif/i, "");
  return suffix === vsId.trim() ? "tagged" : "untagged";
}

function extractInterfaceDescription(block: string): string | null {
  const line = block.split(/\r?\n/).find((item) => /^\s*description\s+/i.test(item.trim()));
  return line ? line.trim().replace(/^description\s+/i, "") : null;
}

function extractInterfaceStatus(block: string): string | null {
  const line = block.split(/\r?\n/).find((item) => /^\s*(admin|oper)\s+status\s+/i.test(item.trim()));
  return line ? line.trim() : null;
}

export function summarizeVsiVplsConfigBlocks(
  rawConfig: string | null | undefined,
  vsId: string | null | undefined,
  vsiName?: string | null,
): VsiVplsConfigBlockSummary[] {
  if (!rawConfig) return [];

  return splitConfigBlocks(rawConfig).map((block) => {
    const interfaceName = extractVlanifName(block);
    if (interfaceName) {
      const mode = inferVlanifMode(interfaceName, vsId);
      return {
        title: interfaceName,
        subtitle: `Entrega ${mode === "tagged" ? "tagged" : "untagged"} · l2 binding vsi ${vsiName ?? vsId ?? "—"}`,
        mode,
        raw: block,
        interfaceName,
      };
    }

    const serviceName = extractServiceName(block) ?? vsiName ?? "VSI";
    return {
      title: `VSI ${serviceName}`,
      subtitle: vsId ? `VS-ID ${vsId}` : "VSI consolidada",
      mode: "service",
      raw: block,
      interfaceName: null,
    };
  });
}

export function summarizeVsiVplsTrafficDelivery(blocks: VsiVplsConfigBlockSummary[]): VsiVplsTrafficDeliverySummary {
  const tagged = blocks.filter((block) => block.mode === "tagged").map((block) => block.title);
  const untagged = blocks.filter((block) => block.mode === "untagged").map((block) => block.title);
  const interfaces = [...tagged, ...untagged];
  const parts: string[] = [];
  if (tagged.length > 0) parts.push(`tagged: ${tagged.join(", ")}`);
  if (untagged.length > 0) parts.push(`untagged: ${untagged.join(", ")}`);
  return {
    tagged,
    untagged,
    interfaces,
    summaryText: parts.length > 0 ? parts.join(" · ") : "sem interfaces agregadas",
  };
}

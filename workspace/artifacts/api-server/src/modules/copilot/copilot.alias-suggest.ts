import type { CopilotResolvedEntity } from "./copilot.tools.types.js";
import { proposeCopilotAlias } from "./copilot.aliases.service.js";

const STOPWORDS = new Set([
  "como", "esta", "está", "peering", "peer", "bgp", "prefixo", "prefix", "cliente", "customer",
  "google", "vivo", "tim", "status", "anuncio", "anúncio", "export", "import", "vrf", "cdn",
  "por", "que", "para", "com", "nao", "não", "saindo", "device", "router", "operadora",
  "explique", "route", "policy", "circuito", "desde", "ontem", "help", "ajuda",
]);

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

export function extractAliasCandidates(input: {
  question: string;
  resolvedEntities: CopilotResolvedEntity[];
}): string[] {
  const known = new Set(
    input.resolvedEntities
      .flatMap((entity) => [entity.canonicalName, ...entity.matchedAliases])
      .map((value) => normalize(value)),
  );

  const matches = input.question.match(/\b[A-Za-z][A-Za-z0-9._-]{2,40}\b/g) ?? [];
  const candidates: string[] = [];

  for (const token of matches) {
    const lower = normalize(token);
    if (STOPWORDS.has(lower)) continue;
    if (known.has(lower)) continue;
    if (/^\d+$/.test(token)) continue;
    if (!candidates.some((item) => normalize(item) === lower)) {
      candidates.push(token);
    }
  }

  return candidates.slice(0, 5);
}

export async function autoProposeAliasCandidates(input: {
  tenantId: number;
  question: string;
  resolvedEntities: CopilotResolvedEntity[];
  createdBy?: number | null;
  source: "low_confidence" | "incorrect_feedback" | "unresolved_entity";
}): Promise<{ proposed: number; candidates: string[] }> {
  const candidates = extractAliasCandidates({
    question: input.question,
    resolvedEntities: input.resolvedEntities,
  });

  let proposed = 0;
  for (const alias of candidates) {
    await proposeCopilotAlias({
      tenantId: input.tenantId,
      alias,
      entityType: "customer",
      canonicalName: alias,
      confidence: input.source === "incorrect_feedback" ? 0.55 : 0.45,
      createdBy: input.createdBy ?? null,
    });
    proposed += 1;
  }

  return { proposed, candidates };
}

import { PROVIDER_ALIASES, resolveProviderAlias } from "./copilot.aliases.js";
import type { CopilotEntity, CopilotIntent } from "./copilot.types.js";

const VALID_INTENTS: CopilotIntent[] = [
  "bgp_peering_status",
  "bgp_announcements",
  "l2_circuit_status",
  "config_guidance",
  "prefix_trace",
  "route_policy_explain",
  "historical_diff",
  "compliance_status",
  "netbox_inventory",
  "help",
  "unknown",
];

const VALID_ENTITY_KINDS = new Set([
  "provider",
  "customer",
  "asn",
  "prefix",
  "peer_ip",
  "vrf",
  "circuit",
  "site",
]);

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export interface CopilotNluConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  minConfidence: number;
}

export interface CopilotNluClassification {
  intent: CopilotIntent;
  confidence: number;
  entities: CopilotEntity[];
  rationale?: string;
}

export interface CopilotNluResolutionMeta {
  used: boolean;
  provider: "ollama" | "none";
  model: string | null;
  confidence: number | null;
  intentOverride: boolean;
  ambiguous: boolean;
  error?: string;
}

export function getCopilotNluConfig(): CopilotNluConfig {
  return {
    enabled: parseBoolean(process.env["NETOPS_COPILOT_NLU_ENABLED"], false),
    baseUrl: (process.env["NETOPS_COPILOT_NLU_BASE_URL"] ?? "http://127.0.0.1:11434").replace(/\/$/, ""),
    model: process.env["NETOPS_COPILOT_NLU_MODEL"]?.trim() || "hermes3",
    timeoutMs: Number.parseInt(process.env["NETOPS_COPILOT_NLU_TIMEOUT_MS"] ?? "", 10) || 8_000,
    minConfidence: Number.parseFloat(process.env["NETOPS_COPILOT_NLU_MIN_CONFIDENCE"] ?? "") || 0.65,
  };
}

export function isCopilotNluEnabled(): boolean {
  return getCopilotNluConfig().enabled;
}

function buildNluSystemPrompt(): string {
  return [
    "Voce classifica perguntas de operadores de rede (NetOps) em intents e entidades.",
    "Responda SOMENTE JSON valido, sem markdown.",
    "Nunca invente dados operacionais (estado de peer, prefixos reais, contadores).",
    "Intents validas:",
    VALID_INTENTS.join(", "),
    'Formato: {"intent":"...","confidence":0.0-1.0,"entities":[{"kind":"customer","value":"SpeedNet"}],"rationale":"..."}',
    "Entity kinds: provider, customer, asn, prefix, peer_ip, vrf, circuit, site.",
    "provider = operadora/CDN/IX (Google, Vivo, TIM, IX.br).",
    "prefix_trace = troubleshooting de prefixo nao saindo/recebido.",
    "historical_diff = o que mudou desde ontem/flaps.",
    "route_policy_explain = explicar route-policy.",
    "config_guidance = como configurar (sem apply).",
  ].join("\n");
}

function parseNluJson(raw: string): CopilotNluClassification | null {
  const trimmed = raw.trim();
  const jsonBlock = trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;
  try {
    const parsed = JSON.parse(jsonBlock) as {
      intent?: string;
      confidence?: number;
      entities?: Array<{ kind?: string; value?: string; label?: string }>;
      rationale?: string;
    };

    const intent = VALID_INTENTS.includes(parsed.intent as CopilotIntent)
      ? parsed.intent as CopilotIntent
      : "unknown";

    const confidence = typeof parsed.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.5;

    const entities: CopilotEntity[] = [];
    for (const row of parsed.entities ?? []) {
      if (!row.kind || !row.value || !VALID_ENTITY_KINDS.has(row.kind)) continue;
      entities.push({
        kind: row.kind as CopilotEntity["kind"],
        value: String(row.value).trim(),
        label: row.label?.trim(),
      });
    }

    return { intent, confidence, entities, rationale: parsed.rationale };
  } catch {
    return null;
  }
}

export function mergeNluEntities(regexEntities: CopilotEntity[], nluEntities: CopilotEntity[]): CopilotEntity[] {
  const merged = [...regexEntities];
  const seen = new Set(regexEntities.map((entity) => `${entity.kind}:${entity.value.toLowerCase()}`));

  for (const entity of nluEntities) {
    if (entity.kind === "provider") {
      const alias = resolveProviderAlias(entity.value.toLowerCase())
        ?? PROVIDER_ALIASES.find((item) =>
          item.displayName.toLowerCase() === entity.value.toLowerCase()
          || item.id === entity.value.toLowerCase(),
        );
      if (alias) {
        const key = `provider:${alias.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push({ kind: "provider", value: alias.id, label: alias.displayName });
        }
      }
      continue;
    }

    const key = `${entity.kind}:${entity.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entity);
  }

  return merged;
}

async function callOllamaChat(input: {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  question: string;
  regexIntent: CopilotIntent;
  regexEntities: CopilotEntity[];
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(`${input.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.model,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: buildNluSystemPrompt() },
          {
            role: "user",
            content: JSON.stringify({
              question: input.question,
              regex_baseline: {
                intent: input.regexIntent,
                entities: input.regexEntities,
              },
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`NLU HTTP ${response.status}`);
    }

    const payload = await response.json() as { message?: { content?: string } };
    return payload.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

export async function classifyIntentWithNlu(input: {
  question: string;
  regexIntent: CopilotIntent;
  regexEntities: CopilotEntity[];
}): Promise<CopilotNluClassification | null> {
  const config = getCopilotNluConfig();
  if (!config.enabled) return null;

  const raw = await callOllamaChat({
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    question: input.question,
    regexIntent: input.regexIntent,
    regexEntities: input.regexEntities,
  });

  return parseNluJson(raw);
}

export function buildCopilotNluToolRun(parsed: {
  intent: CopilotIntent;
  nlu: CopilotNluResolutionMeta;
}): import("./copilot.tools.types.js").CopilotToolRunRecord | null {
  if (!parsed.nlu.used) return null;

  return {
    toolName: "copilot_nlu_classify",
    status: "ok",
    durationMs: 0,
    input: {
      ambiguous: parsed.nlu.ambiguous,
      intentOverride: parsed.nlu.intentOverride,
    },
    output: {
      notes: [
        `NLU classificou intent=${parsed.intent} (conf=${parsed.nlu.confidence?.toFixed(2) ?? "?"})`,
      ],
    },
    source: {
      type: "nlu",
      ref: parsed.nlu.model ?? "ollama",
      collectedAt: new Date().toISOString(),
    },
  };
}

export async function probeCopilotNlu(): Promise<{ reachable: boolean; model?: string; error?: string }> {
  const config = getCopilotNluConfig();
  if (!config.enabled) {
    return { reachable: false, error: "NLU disabled" };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    const response = await fetch(`${config.baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return { reachable: false, error: `HTTP ${response.status}` };
    return { reachable: true, model: config.model };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

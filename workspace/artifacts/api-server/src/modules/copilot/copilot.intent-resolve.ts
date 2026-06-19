import {
  classifyIntentWithNlu,
  getCopilotNluConfig,
  isCopilotNluEnabled,
  mergeNluEntities,
  type CopilotNluResolutionMeta,
} from "./copilot.nlu.js";
import { parseCopilotIntent, type ParsedCopilotIntent } from "./copilot.intent.js";
import type { CopilotEntity, CopilotIntent } from "./copilot.types.js";

export interface IntentSignals {
  hasPeering: boolean;
  hasAnnounce: boolean;
  hasCircuit: boolean;
  hasConfig: boolean;
  hasHistory: boolean;
  hasPolicyExplain: boolean;
  hasTroubleshoot: boolean;
  hasStatus: boolean;
  hasPrefix: boolean;
}

export interface ResolvedCopilotIntent extends ParsedCopilotIntent {
  nlu: CopilotNluResolutionMeta;
}

export function computeIntentSignals(question: string, entities: CopilotEntity[]): IntentSignals {
  const lower = question.toLowerCase();
  const hasPrefix = entities.some((entity) => entity.kind === "prefix")
    || /\b(?:(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2})\b/.test(question);

  return {
    hasPeering: /\b(peering|peer|sess[aã]o|vizinho|bgp)\b/i.test(lower) || entities.some((e) => e.kind === "provider"),
    hasAnnounce: /\b(an[uú]ncio|prefixo|export|import|propag)\b/i.test(lower) || hasPrefix || entities.some((e) => e.kind === "asn"),
    hasCircuit: /\b(circuito|l2|l2vc|vsi|pw)\b/i.test(lower) || entities.some((e) => e.kind === "circuit"),
    hasConfig: /\b(como configur|template|route-policy)\b/i.test(lower),
    hasHistory: /\b(o que mudou|desde ontem|hist[oó]rico|flap)\b/i.test(lower),
    hasPolicyExplain: /\b(explique|explain|o que faz)\b/i.test(lower) || /\bRP[-_]/i.test(question),
    hasTroubleshoot: /\b(por que|porque|nao esta saindo|n[aã]o est[aá] saindo|motivo)\b/i.test(lower),
    hasStatus: /\b(como est[aá]|status|situa[cç][aã]o)\b/i.test(lower),
    hasPrefix,
  };
}

export function isIntentAmbiguous(parsed: ParsedCopilotIntent, signals: IntentSignals): boolean {
  if (parsed.intent === "unknown") return true;
  if (parsed.intent === "help") return false;

  const strongSignals = [
    signals.hasPeering,
    signals.hasAnnounce,
    signals.hasCircuit,
    signals.hasConfig,
    signals.hasHistory,
    signals.hasPolicyExplain,
    signals.hasTroubleshoot,
  ].filter(Boolean).length;

  if (strongSignals >= 2) return true;

  if (signals.hasTroubleshoot && signals.hasAnnounce && parsed.intent !== "prefix_trace") {
    return true;
  }

  if (signals.hasStatus && signals.hasConfig) return true;

  if (signals.hasPrefix && signals.hasPeering && signals.hasAnnounce
    && !["prefix_trace", "bgp_announcements", "bgp_peering_status"].includes(parsed.intent)) {
    return true;
  }

  return false;
}

function emptyNluMeta(ambiguous: boolean): CopilotNluResolutionMeta {
  return {
    used: false,
    provider: "none",
    model: null,
    confidence: null,
    intentOverride: false,
    ambiguous,
  };
}

export async function resolveCopilotIntent(question: string): Promise<ResolvedCopilotIntent> {
  const regex = parseCopilotIntent(question);
  const signals = computeIntentSignals(question, regex.entities);
  const ambiguous = isIntentAmbiguous(regex, signals);

  if (!isCopilotNluEnabled() || !ambiguous) {
    return { ...regex, nlu: emptyNluMeta(ambiguous) };
  }

  const config = getCopilotNluConfig();

  try {
    const nlu = await classifyIntentWithNlu({
      question,
      regexIntent: regex.intent,
      regexEntities: regex.entities,
    });

    if (!nlu || nlu.confidence < config.minConfidence || nlu.intent === "unknown") {
      return {
        ...regex,
        nlu: {
          ...emptyNluMeta(true),
          confidence: nlu?.confidence ?? null,
          error: nlu ? "confidence below threshold" : "invalid NLU response",
        },
      };
    }

    const intentOverride = nlu.intent !== regex.intent;
    const entities = mergeNluEntities(regex.entities, nlu.entities);

    return {
      intent: nlu.intent as CopilotIntent,
      entities,
      nlu: {
        used: true,
        provider: "ollama",
        model: config.model,
        confidence: nlu.confidence,
        intentOverride,
        ambiguous: true,
      },
    };
  } catch (error) {
    return {
      ...regex,
      nlu: {
        ...emptyNluMeta(true),
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

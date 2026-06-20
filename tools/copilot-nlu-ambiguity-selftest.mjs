#!/usr/bin/env node
import assert from "node:assert/strict";

function computeIntentSignals(question, entities) {
  const lower = question.toLowerCase();
  const hasPrefix = entities.some((e) => e.kind === "prefix")
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

function isIntentAmbiguous(parsed, signals) {
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
  if (signals.hasTroubleshoot && signals.hasAnnounce && parsed.intent !== "prefix_trace") return true;
  if (signals.hasStatus && signals.hasConfig) return true;
  return false;
}

const ambiguousCases = [
  {
    intent: "unknown",
    entities: [],
    question: "me fala sobre a rede da SpeedNet",
    expect: true,
  },
  {
    intent: "bgp_peering_status",
    entities: [{ kind: "provider", value: "google" }],
    question: "status do peering Google e anuncio do prefixo 10.0.0.0/24",
    expect: true,
  },
  {
    intent: "bgp_peering_status",
    entities: [{ kind: "provider", value: "google" }],
    question: "como esta o peering com Google?",
    expect: false,
  },
];

for (const row of ambiguousCases) {
  const signals = computeIntentSignals(row.question, row.entities);
  const ambiguous = isIntentAmbiguous({ intent: row.intent, entities: row.entities }, signals);
  assert.equal(ambiguous, row.expect, row.question);
}

console.log("copilot-nlu-ambiguity-selftest: PASS");

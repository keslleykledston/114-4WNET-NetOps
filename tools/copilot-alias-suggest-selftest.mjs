#!/usr/bin/env node
import assert from "node:assert/strict";

const STOPWORDS = new Set(["como", "esta", "peering", "google", "prefixo"]);

function extractAliasCandidates(question, resolvedEntities) {
  const known = new Set(
    resolvedEntities.flatMap((entity) => [entity.canonicalName, ...entity.matchedAliases]).map((v) => v.toLowerCase()),
  );
  const matches = question.match(/\b[A-Za-z][A-Za-z0-9._-]{2,40}\b/g) ?? [];
  const candidates = [];
  for (const token of matches) {
    const lower = token.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    if (known.has(lower)) continue;
    if (!candidates.some((item) => item.toLowerCase() === lower)) candidates.push(token);
  }
  return candidates.slice(0, 5);
}

const candidates = extractAliasCandidates(
  "Por que SpeedNet nao anuncia para Google?",
  [{ canonicalName: "Google", matchedAliases: ["google"] }],
);
assert.ok(candidates.includes("SpeedNet"));
assert.ok(!candidates.includes("Google"));

console.log("copilot-alias-suggest-selftest: PASS");

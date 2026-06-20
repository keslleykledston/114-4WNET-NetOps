#!/usr/bin/env node
import assert from "node:assert/strict";

const PROVIDER_ALIASES = [
  { id: "google", keywords: ["google", "gcp", "youtube"], vrf: "CDN" },
];

function resolveProviderAlias(text) {
  const normalized = text.toLowerCase();
  return PROVIDER_ALIASES.find((alias) => alias.keywords.some((keyword) => normalized.includes(keyword))) ?? null;
}

function parseCopilotIntent(question) {
  const text = question.trim();
  const lower = text.toLowerCase();
  const entities = [];
  const provider = resolveProviderAlias(lower);
  if (provider) entities.push({ kind: "provider", value: provider.id });
  const prefixMatch = text.match(/\b(?:(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2})\b/i);
  if (prefixMatch) entities.push({ kind: "prefix", value: prefixMatch[0] });
  const asnMatch = lower.match(/\b(?:AS[N]?\s*)?(\d{3,6})\b/i);
  if (asnMatch && !prefixMatch) entities.push({ kind: "asn", value: asnMatch[1] });
  const hasPeering = /\b(peering|peer|sess[aã]o|vizinho|bgp)\b/i.test(lower) || provider;
  const hasAnnounce = /\b(an[uú]ncio|prefixo|export|import)\b/i.test(lower) || Boolean(prefixMatch) || entities.some((e) => e.kind === "asn");
  const hasCircuit = /\b(circuito|l2|vsi)\b/i.test(lower);
  const hasConfig = /\b(como configur\w*|como criar|template)\b/i.test(lower);
  const hasStatus = /\b(como est[aá]|status|situa[cç][aã]o)\b/i.test(lower);
  const hasTroubleshoot = /\b(por que|nao esta saindo)\b/i.test(lower);
  const hasHistory = /\b(o que mudou|desde ontem|historico)\b/i.test(lower);
  const hasPolicyExplain = /\b(explique|explain)\b/i.test(lower);
  const hasCompliance = /\b(compliance|conformidade|achado|finding|viola[cç][aã]o|baseline|auditoria)\b/i.test(lower);
  const hasNetbox = /\b(netbox|net\s*box|invent[aá]rio externo)\b/i.test(lower);
  let intent = "unknown";
  if (hasHistory) intent = "historical_diff";
  else if (hasPolicyExplain) intent = "route_policy_explain";
  else if (hasNetbox) intent = "netbox_inventory";
  else if (hasCompliance) intent = "compliance_status";
  else if (prefixMatch && hasTroubleshoot) intent = "prefix_trace";
  else if (hasConfig && !hasStatus) intent = "config_guidance";
  else if (hasAnnounce) intent = "bgp_announcements";
  else if (hasPeering) intent = "bgp_peering_status";
  else if (hasCircuit) intent = "l2_circuit_status";
  return { intent, entities };
}

assert.equal(parseCopilotIntent("Como esta o peering do Google na CDN?").intent, "bgp_peering_status");
assert.equal(parseCopilotIntent("O prefixo 200.1.2.0/24 esta sendo exportado?").intent, "bgp_announcements");
assert.equal(parseCopilotIntent("O cliente AS268836 anuncia quais prefixos?").entities[0]?.value, "268836");
assert.equal(parseCopilotIntent("Status do circuito VSI cliente-acme").intent, "l2_circuit_status");
assert.equal(parseCopilotIntent("Como configurar peer BGP 203.0.113.5 AS15169 na VRF CDN?").intent, "config_guidance");
assert.equal(parseCopilotIntent("Por que o prefixo 45.7.10.0/24 nao esta saindo para a Vivo?").intent, "prefix_trace");
assert.equal(parseCopilotIntent("Explique a route-policy RP-CLIENTE-IN").intent, "route_policy_explain");
assert.equal(parseCopilotIntent("O que mudou nos anuncios desde ontem?").intent, "historical_diff");
assert.equal(parseCopilotIntent("Quais achados de compliance fail no device?").intent, "compliance_status");
assert.equal(parseCopilotIntent("Quais devices do escopo existem no NetBox?").intent, "netbox_inventory");

console.log("copilot-intent-selftest: PASS");

import { resolveProviderAlias } from "./copilot.aliases.js";
import type { CopilotEntity, CopilotIntent } from "./copilot.types.js";

const PEERING_PATTERNS = /\b(peering|peer|sess[aã]o|vizinho|bgp)\b/i;
const ANNOUNCE_PATTERNS = /\b(an[uú]ncio|anuncia|prefixo|prefix|rota|export|import|propag)\b/i;
const CIRCUIT_PATTERNS = /\b(circuito|l2|l2vc|vsi|pw|pseudowire|vlan)\b/i;
const CONFIG_PATTERNS = /\b(como configur\w*|como criar|como adicionar|passo a passo|template|exemplo de config|dica de config)\b/i;
const STATUS_PATTERNS = /\b(como est[aá]|status|situa[cç][aã]o|up|down|established|ativo)\b/i;
const TROUBLESHOOT_PATTERNS = /\b(por que|porque|nao esta saindo|n[aã]o est[aá] saindo|motivo|diagn[oó]stico|troubleshoot)\b/i;
const HISTORY_PATTERNS = /\b(o que mudou|desde ontem|hist[oó]rico|ultimo flap|[uú]ltimo flap|quando parou)\b/i;
const COMPLIANCE_PATTERNS = /\b(compliance|conformidade|achado|findings?|viola[cç][aã]o|baseline|auditoria|pol[ií]tica de seguran[cç]a)\b/i;
const NETBOX_PATTERNS = /\b(netbox|net\s*box|invent[aá]rio externo)\b/i;
const L2_FINDING_PATTERNS = /\b(vsi_down|pw_partial_down|rn-141|finding l2|achado l2|circuito down)\b/i;
const POLICY_EXPLAIN_PATTERNS = /\b(explique|explain|o que faz|depend[eê]ncias?\s+(da|de))\b/i;

const PREFIX_RE = /\b(?:(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}|(?:[0-9a-f:]+)\/\d{1,3})\b/i;
const ASN_RE = /\b(?:AS[N]?\s*)?(\d{3,6})\b/i;
const PEER_IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d?\d)){3}|(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4})\b/i;
const VRF_RE = /\bvpn-instance\s+(\S+)|\bvrf\s+(\S+)/i;

export interface ParsedCopilotIntent {
  intent: CopilotIntent;
  entities: CopilotEntity[];
}

function uniqueEntities(entities: CopilotEntity[]): CopilotEntity[] {
  const seen = new Set<string>();
  return entities.filter((entity) => {
    const key = `${entity.kind}:${entity.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseCopilotIntent(question: string): ParsedCopilotIntent {
  const text = question.trim();
  const lower = text.toLowerCase();
  const entities: CopilotEntity[] = [];

  const provider = resolveProviderAlias(lower);
  if (provider) {
    entities.push({ kind: "provider", value: provider.id, label: provider.displayName });
  }

  const prefixMatch = text.match(PREFIX_RE);
  if (prefixMatch) {
    entities.push({ kind: "prefix", value: prefixMatch[0] });
  }

  const asnMatch = lower.match(ASN_RE);
  if (asnMatch && !prefixMatch) {
    const asn = Number(asnMatch[1]);
    if (asn >= 1 && asn <= 4_294_967_295) {
      entities.push({ kind: "asn", value: String(asn), label: `AS${asn}` });
    }
  }

  const peerIpMatch = text.match(PEER_IP_RE);
  if (peerIpMatch && !prefixMatch) {
    entities.push({ kind: "peer_ip", value: peerIpMatch[0] });
  }

  const vrfMatch = text.match(VRF_RE);
  if (vrfMatch) {
    const vrf = vrfMatch[1] ?? vrfMatch[2];
    if (vrf) entities.push({ kind: "vrf", value: vrf, label: vrf });
  }

  if (/\b(cliente|customer|cliente)\b/i.test(lower)) {
    const nameMatch = lower.match(/\bcliente\s+([a-z0-9._-]{2,40})/i);
    if (nameMatch) {
      entities.push({ kind: "customer", value: nameMatch[1], label: nameMatch[1] });
    }
  }

  const siteMatch = lower.match(/\b(?:em|no pop|site)\s+([a-z0-9][a-z0-9._-]{2,30})\b/i);
  if (siteMatch) {
    entities.push({ kind: "site", value: siteMatch[1], label: siteMatch[1].toUpperCase() });
  }

  if (CIRCUIT_PATTERNS.test(lower)) {
    const circuitMatch = lower.match(/\bcircuito\s+([a-z0-9._/-]{2,40})/i)
      ?? lower.match(/\bvsi\s+([a-z0-9._/-]{2,40})/i)
      ?? lower.match(/\bvc[\s-]?id\s+(\d+)/i);
    if (circuitMatch) {
      entities.push({ kind: "circuit", value: circuitMatch[1], label: circuitMatch[1] });
    }
  }

  const hasPeering = PEERING_PATTERNS.test(lower) || provider !== null;
  const hasAnnounce = ANNOUNCE_PATTERNS.test(lower) || Boolean(prefixMatch) || entities.some((e) => e.kind === "asn");
  const hasCircuit = CIRCUIT_PATTERNS.test(lower) || entities.some((e) => e.kind === "circuit");
  const hasCompliance = COMPLIANCE_PATTERNS.test(lower);
  const hasNetbox = NETBOX_PATTERNS.test(lower)
    || (/\b(sync|sincroniz|preview|espelh)\b/i.test(lower) && /\b(netbox|invent[aá]rio)\b/i.test(lower));
  const hasL2Finding = L2_FINDING_PATTERNS.test(lower);
  const hasConfig = CONFIG_PATTERNS.test(lower) || /\b(route-policy|ip-prefix|peer enable)\b/i.test(lower);

  if (POLICY_EXPLAIN_PATTERNS.test(lower) || /\broute-policy\b/i.test(lower) || /\bRP[-_]/i.test(text)) {
    const policyMatch = text.match(/\b(?:route-policy|policy)\s+([A-Za-z0-9._/-]+)/i)
      ?? text.match(/\b(RP[-_][A-Za-z0-9._/-]+)/i);
    if (policyMatch) {
      entities.push({ kind: "circuit", value: policyMatch[1], label: policyMatch[1] });
    }
  }

  let intent: CopilotIntent = "unknown";
  if (HISTORY_PATTERNS.test(lower)) {
    intent = "historical_diff";
  } else if (POLICY_EXPLAIN_PATTERNS.test(lower) || (/\broute-policy\b/i.test(lower) && !hasConfig)) {
    intent = "route_policy_explain";
  } else if (prefixMatch && (TROUBLESHOOT_PATTERNS.test(lower) || entities.some((e) => e.kind === "customer"))) {
    intent = "prefix_trace";
  } else if (hasConfig && !STATUS_PATTERNS.test(lower)) {
    intent = "config_guidance";
  } else if (hasAnnounce && (entities.some((e) => e.kind === "prefix" || e.kind === "asn" || e.kind === "customer") || provider)) {
    intent = "bgp_announcements";
  } else if (hasPeering || (STATUS_PATTERNS.test(lower) && (provider || entities.some((e) => e.kind === "peer_ip" || e.kind === "asn")))) {
    intent = "bgp_peering_status";
  } else if (hasNetbox) {
    intent = "netbox_inventory";
  } else if (hasCompliance) {
    intent = "compliance_status";
  } else if (hasL2Finding || (hasCircuit && /\b(finding|achado|down|partial)\b/i.test(lower))) {
    intent = "l2_circuit_status";
  } else if (hasCircuit) {
    intent = "l2_circuit_status";
  } else if (/^(ajuda|help|o que|como usar)/i.test(lower)) {
    intent = "help";
  } else if (hasAnnounce) {
    intent = "bgp_announcements";
  } else if (hasPeering) {
    intent = "bgp_peering_status";
  }

  return {
    intent,
    entities: uniqueEntities(entities),
  };
}

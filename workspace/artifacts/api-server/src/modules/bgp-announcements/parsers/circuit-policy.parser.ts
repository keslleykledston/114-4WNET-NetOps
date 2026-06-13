import type { AnnouncementFamily, ParsedCircuitPolicy } from "../bgp-announcement.types.js";

const RE_CIRCUIT_SIMPLE =
  /^C(?<circuit_id>\d{2})(?:-[A-Z0-9_.]+)?-(?<function>IMPORT|EXPORT)(?:[-_](?<family>IPV4|IPV6|V4|V6))?$/i;

const RE_CIRCUIT_FULL =
  /^C(?<circuit_id>\d{2})-AS(?<asn>\d+)_(?<name>[A-Z0-9_.-]+)-(?<function>IMPORT|EXPORT)(?:[-_](?<family>IPV4|IPV6|V4|V6))?$/i;

function parseFamily(raw: string | undefined): AnnouncementFamily | null {
  if (!raw) return null;
  const u = raw.toUpperCase();
  if (u === "IPV4" || u === "V4") return "ipv4";
  if (u === "IPV6" || u === "V6") return "ipv6";
  return null;
}

export function parseCircuitPolicyName(policyName: string): ParsedCircuitPolicy | null {
  const name = (policyName || "").trim();
  if (!name) return null;

  const full = RE_CIRCUIT_FULL.exec(name);
  if (full?.groups) {
    return {
      circuitId: full.groups.circuit_id,
      function: full.groups.function.toUpperCase() as "IMPORT" | "EXPORT",
      family: parseFamily(full.groups.family),
      asn: Number(full.groups.asn),
      name: full.groups.name.replace(/_/g, "-"),
      rawName: name,
      format: "full",
    };
  }

  const simple = RE_CIRCUIT_SIMPLE.exec(name);
  if (simple?.groups) {
    return {
      circuitId: simple.groups.circuit_id,
      function: simple.groups.function.toUpperCase() as "IMPORT" | "EXPORT",
      family: parseFamily(simple.groups.family),
      asn: null,
      name: null,
      rawName: name,
      format: "simple",
    };
  }

  // Variants like C02-TIM-EXPORT
  const variant = /^C(\d{2})-[A-Z0-9_.-]+-(IMPORT|EXPORT)(?:[-_](IPV4|IPV6|V4|V6))?$/i.exec(name);
  if (variant) {
    return {
      circuitId: variant[1],
      function: variant[2].toUpperCase() as "IMPORT" | "EXPORT",
      family: parseFamily(variant[3]),
      asn: null,
      name: variant[0].split("-")[1] ?? null,
      rawName: name,
      format: "variant",
    };
  }

  return null;
}

export function isUpstreamCircuitPolicy(policyName: string): boolean {
  return parseCircuitPolicyName(policyName) !== null;
}

export function circuitDisplayNameFallback(circuitId: string): string {
  return `C${circuitId}`;
}

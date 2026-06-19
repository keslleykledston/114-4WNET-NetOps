import { copilotEntitiesTable, copilotLearnedAliasesTable, db } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { PROVIDER_ALIASES, resolveProviderAlias } from "./copilot.aliases.js";
import type { CopilotResolvedEntity } from "./copilot.tools.types.js";
import type { CopilotEntity } from "./copilot.types.js";

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

async function loadTenantEntities(tenantId: number | null) {
  if (tenantId == null) return [];
  return db
    .select()
    .from(copilotEntitiesTable)
    .where(and(eq(copilotEntitiesTable.tenantId, tenantId), eq(copilotEntitiesTable.enabled, true)));
}

async function loadApprovedAliases(tenantId: number | null) {
  if (tenantId == null) return [];
  return db
    .select()
    .from(copilotLearnedAliasesTable)
    .where(and(
      eq(copilotLearnedAliasesTable.tenantId, tenantId),
      eq(copilotLearnedAliasesTable.status, "approved"),
    ));
}

export async function resolveCopilotEntities(input: {
  question: string;
  tenantId: number | null;
  parsedEntities: CopilotEntity[];
}): Promise<CopilotResolvedEntity[]> {
  const resolved: CopilotResolvedEntity[] = [];
  const seen = new Set<string>();
  const lower = input.question.toLowerCase();

  const dbEntities = await loadTenantEntities(input.tenantId);
  const learnedAliases = await loadApprovedAliases(input.tenantId);

  for (const row of dbEntities) {
    const aliases = [row.canonicalName, ...(row.aliases ?? [])];
    const matched = aliases.filter((alias) => lower.includes(normalize(alias)));
    if (matched.length === 0) continue;
    const key = `${row.entityType}:${row.canonicalName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    resolved.push({
      canonicalName: row.canonicalName,
      entityType: row.entityType,
      asn: row.asn ?? null,
      matchedAliases: matched,
      confidence: 0.95,
      vrf: typeof metadata.vrf === "string" ? metadata.vrf : null,
    });
  }

  for (const learned of learnedAliases) {
    if (!lower.includes(normalize(learned.alias))) continue;
    const key = `${learned.entityType}:${learned.canonicalName ?? learned.alias}`;
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push({
      canonicalName: learned.canonicalName ?? learned.alias,
      entityType: learned.entityType,
      asn: null,
      matchedAliases: [learned.alias],
      confidence: learned.confidence ?? 0.8,
      vrf: null,
    });
  }

  const staticProvider = resolveProviderAlias(lower);
  if (staticProvider) {
    const key = `cdn:${staticProvider.displayName}`;
    if (!seen.has(key)) {
      seen.add(key);
      resolved.push({
        canonicalName: staticProvider.displayName,
        entityType: "cdn",
        asn: staticProvider.remoteAs?.[0] ?? null,
        matchedAliases: staticProvider.keywords.filter((keyword) => lower.includes(keyword)),
        confidence: 0.9,
        vrf: staticProvider.vrf ?? null,
      });
    }
  }

  for (const alias of PROVIDER_ALIASES) {
    if (staticProvider?.id === alias.id) continue;
    const matched = alias.keywords.filter((keyword) => lower.includes(keyword));
    if (matched.length === 0) continue;
    const key = `cdn:${alias.displayName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push({
      canonicalName: alias.displayName,
      entityType: "cdn",
      asn: alias.remoteAs?.[0] ?? null,
      matchedAliases: matched,
      confidence: 0.88,
      vrf: alias.vrf ?? null,
    });
  }

  for (const entity of input.parsedEntities) {
    if (entity.kind === "asn") {
      const key = `asn:AS${entity.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push({
        canonicalName: `AS${entity.value}`,
        entityType: "asn",
        asn: Number(entity.value),
        matchedAliases: [entity.value],
        confidence: 0.99,
        vrf: null,
      });
    }
    if (entity.kind === "prefix") {
      const key = `prefix:${entity.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push({
        canonicalName: entity.value,
        entityType: "prefix",
        asn: null,
        matchedAliases: [entity.value],
        confidence: 0.99,
        vrf: null,
      });
    }
    if (entity.kind === "customer") {
      const key = `customer:${entity.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push({
        canonicalName: entity.label ?? entity.value,
        entityType: "customer",
        asn: null,
        matchedAliases: [entity.value],
        confidence: 0.92,
        vrf: null,
      });
    }
    if (entity.kind === "provider") {
      const staticAlias = PROVIDER_ALIASES.find((item) => item.id === entity.value);
      if (!staticAlias) continue;
      const key = `cdn:${staticAlias.displayName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push({
        canonicalName: staticAlias.displayName,
        entityType: "cdn",
        asn: staticAlias.remoteAs?.[0] ?? null,
        matchedAliases: [entity.label ?? staticAlias.displayName],
        confidence: 0.94,
        vrf: staticAlias.vrf ?? null,
      });
    }
  }

  return resolved.sort((left, right) => right.confidence - left.confidence);
}

export function mergeResolvedIntoEntities(
  parsed: CopilotEntity[],
  resolved: CopilotResolvedEntity[],
): CopilotEntity[] {
  const merged = [...parsed];
  for (const item of resolved) {
    if (item.entityType === "cdn" || item.entityType === "provider") {
      const id = item.canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      merged.push({ kind: "provider", value: id, label: item.canonicalName });
    }
    if (item.entityType === "customer") {
      merged.push({ kind: "customer", value: item.canonicalName, label: item.canonicalName });
    }
    if (item.entityType === "asn" && item.asn != null) {
      merged.push({ kind: "asn", value: String(item.asn), label: `AS${item.asn}` });
    }
    if (item.entityType === "prefix") {
      merged.push({ kind: "prefix", value: item.canonicalName });
    }
  }

  const seen = new Set<string>();
  return merged.filter((entity) => {
    const key = `${entity.kind}:${entity.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

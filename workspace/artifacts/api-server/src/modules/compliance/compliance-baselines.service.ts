import { and, eq, desc, inArray } from "drizzle-orm";
import {
  db,
  complianceBaselinesTable,
  compliancePoliciesTable,
  devicesTable,
  type ComplianceBaseline,
} from "@workspace/db";

export interface BaselineRuleOverride {
  enabled?: boolean;
  severityOverride?: string;
}

export interface EffectiveRuleMap {
  [rulePattern: string]: {
    enabled: boolean;
    severityOverride?: string;
  };
}

export async function listBaselines(scopeType?: string): Promise<ComplianceBaseline[]> {
  if (!scopeType) {
    return db.select().from(complianceBaselinesTable).orderBy(complianceBaselinesTable.name);
  }

  return db
    .select()
    .from(complianceBaselinesTable)
    .where(eq(complianceBaselinesTable.scopeType, scopeType))
    .orderBy(complianceBaselinesTable.name);
}

export async function getBaseline(id: number): Promise<ComplianceBaseline | null> {
  const [baseline] = await db
    .select()
    .from(complianceBaselinesTable)
    .where(eq(complianceBaselinesTable.id, id))
    .limit(1);

  return baseline || null;
}

export interface CreateBaselineInput {
  scopeType: string;
  scopeId?: string | null;
  name: string;
  description?: string | null;
  rulesJson?: Record<string, BaselineRuleOverride>;
  enabled?: boolean;
}

export async function createBaseline(data: CreateBaselineInput): Promise<ComplianceBaseline> {
  const [baseline] = await db
    .insert(complianceBaselinesTable)
    .values({
      scopeType: data.scopeType,
      scopeId: data.scopeId || null,
      name: data.name,
      description: data.description || null,
      rulesJson: data.rulesJson || {},
      enabled: data.enabled !== false,
    })
    .returning();

  return baseline;
}

export interface UpdateBaselineInput {
  name?: string;
  description?: string | null;
  rulesJson?: Record<string, BaselineRuleOverride>;
  enabled?: boolean;
}

export async function updateBaseline(id: number, data: UpdateBaselineInput): Promise<ComplianceBaseline> {
  const [baseline] = await db
    .update(complianceBaselinesTable)
    .set({
      name: data.name,
      description: data.description,
      rulesJson: data.rulesJson,
      enabled: data.enabled,
      updatedAt: new Date(),
    })
    .where(eq(complianceBaselinesTable.id, id))
    .returning();

  return baseline;
}

export async function deleteBaseline(id: number): Promise<void> {
  await db.delete(complianceBaselinesTable).where(eq(complianceBaselinesTable.id, id));
}

// Resolve effective rules for a device — stacking GLOBAL → SITE → VENDOR → DEVICE
export async function resolveEffectiveRules(deviceId: number, vendor: string, site: string): Promise<EffectiveRuleMap> {
  const baselines = await db
    .select()
    .from(complianceBaselinesTable)
    .where(
      and(
        eq(complianceBaselinesTable.enabled, true),
        inArray(complianceBaselinesTable.scopeType, ["GLOBAL", "SITE", "VENDOR", "DEVICE"])
      )
    )
    .orderBy(complianceBaselinesTable.scopeType);

  const effectiveRules: EffectiveRuleMap = {};

  // Start with GLOBAL baseline
  const globalBaselines = baselines.filter((b) => b.scopeType === "GLOBAL" && !b.scopeId);
  for (const baseline of globalBaselines) {
    const rules = (baseline.rulesJson as Record<string, BaselineRuleOverride>) || {};
    for (const [pattern, override] of Object.entries(rules)) {
      effectiveRules[pattern] = {
        enabled: override.enabled !== false,
        severityOverride: override.severityOverride,
      };
    }
  }

  // Layer SITE baseline
  const siteBaselines = baselines.filter((b) => b.scopeType === "SITE" && b.scopeId === site);
  for (const baseline of siteBaselines) {
    const rules = (baseline.rulesJson as Record<string, BaselineRuleOverride>) || {};
    for (const [pattern, override] of Object.entries(rules)) {
      effectiveRules[pattern] = {
        enabled: override.enabled !== false,
        severityOverride: override.severityOverride,
      };
    }
  }

  // Layer VENDOR baseline
  const vendorBaselines = baselines.filter((b) => b.scopeType === "VENDOR" && b.scopeId === vendor);
  for (const baseline of vendorBaselines) {
    const rules = (baseline.rulesJson as Record<string, BaselineRuleOverride>) || {};
    for (const [pattern, override] of Object.entries(rules)) {
      effectiveRules[pattern] = {
        enabled: override.enabled !== false,
        severityOverride: override.severityOverride,
      };
    }
  }

  // Layer DEVICE baseline (highest precedence)
  const deviceBaselines = baselines.filter((b) => b.scopeType === "DEVICE" && b.scopeId === String(deviceId));
  for (const baseline of deviceBaselines) {
    const rules = (baseline.rulesJson as Record<string, BaselineRuleOverride>) || {};
    for (const [pattern, override] of Object.entries(rules)) {
      effectiveRules[pattern] = {
        enabled: override.enabled !== false,
        severityOverride: override.severityOverride,
      };
    }
  }

  return effectiveRules;
}

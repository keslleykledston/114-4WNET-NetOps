import { db } from "@workspace/db";
import {
  provisioningTemplatesTable,
  provisioningTemplateVersionsTable,
  provisioningTemplateAuditLogsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { PROVISIONING_TEMPLATES } from "./provisioning-template-registry";

export interface TemplateRegistryEntry {
  id: number;
  name: string;
  vendor: string;
  serviceType: string;
  version: string;
  status: "SYSTEM" | "CUSTOM" | "DRAFT" | "APPROVED" | "DEPRECATED";
  source: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateDetail extends TemplateRegistryEntry {
  variablesJson?: string | null;
  validationRulesJson?: string | null;
  templateBody?: string | null;
  createdBy?: string | null;
  approvedBy?: string | null;
  editable: boolean;
}

export interface TemplateVersion {
  id: number;
  version: string;
  status: string;
  changedBy?: string | null;
  changeReason?: string | null;
  createdAt: string;
}

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  line: string;
  lineNumber: number;
}

export interface TemplateExport {
  template: TemplateDetail;
  templateBody: string;
  export: {
    format: "json" | "markdown";
    exportedAt: string;
    exportedBy: string;
  };
}

function maskSensitiveContent(content: string): string {
  return content
    .replace(/password=[^\s&}]*/gi, "password=[REDACTED]")
    .replace(/community=[^\s&}]*/gi, "community=[REDACTED]")
    .replace(/secret=[^\s&}]*/gi, "secret=[REDACTED]")
    .replace(/key=[^\s&}]*/gi, "key=[REDACTED]");
}

export async function seedSystemTemplates() {
  for (const template of PROVISIONING_TEMPLATES) {
    const variables = JSON.stringify(template.parameterSchema || {});
    const validation = JSON.stringify({
      risks: template.risks || [],
      precheckHints: template.precheckHints || [],
      postcheckHints: template.postcheckHints || [],
    });

    // Insert or update template
    const existing = await db
      .select()
      .from(provisioningTemplatesTable)
      .where(
        and(
          eq(provisioningTemplatesTable.name, template.name),
          eq(provisioningTemplatesTable.vendor, template.vendor),
          eq(provisioningTemplatesTable.serviceType, template.serviceType),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      const inserted = await db
        .insert(provisioningTemplatesTable)
        .values({
          name: template.name,
          vendor: template.vendor,
          serviceType: template.serviceType,
          version: "1.0.0",
          status: "SYSTEM",
          source: "in_memory",
          variablesJson: variables,
          validationRulesJson: validation,
          templateBody: template.configTemplate,
          description: template.description,
          createdBy: "system",
        })
        .returning();

      if (inserted[0]) {
        // Insert initial version
        await db.insert(provisioningTemplateVersionsTable).values({
          templateId: inserted[0].id,
          version: "1.0.0",
          status: "SYSTEM",
          templateBody: template.configTemplate,
          variablesJson: variables,
          validationRulesJson: validation,
          changedBy: "system",
          changeReason: "Initial system template seed",
        });
      }
    }
  }
}

export async function listTemplateRegistry(filters?: {
  status?: string;
  vendor?: string;
  limit?: number;
  offset?: number;
}): Promise<TemplateRegistryEntry[]> {
  let query = db.select().from(provisioningTemplatesTable);

  if (filters?.status) {
    query = query.where(eq(provisioningTemplatesTable.status, filters.status));
  }

  if (filters?.vendor) {
    query = query.where(eq(provisioningTemplatesTable.vendor, filters.vendor));
  }

  // @ts-ignore - drizzle generics
  const limit = filters?.limit || 100;
  // @ts-ignore
  const offset = filters?.offset || 0;

  // @ts-ignore
  const results = await query.limit(limit).offset(offset);

  return results.map((t) => ({
    id: t.id,
    name: t.name,
    vendor: t.vendor,
    serviceType: t.serviceType,
    version: t.version,
    status: t.status as "SYSTEM" | "CUSTOM" | "DRAFT" | "APPROVED" | "DEPRECATED",
    source: t.source,
    description: t.description,
    createdAt: t.createdAt?.toISOString() || "",
    updatedAt: t.updatedAt?.toISOString() || "",
  }));
}

export async function getTemplateDetail(id: number, actor?: string, ip?: string): Promise<TemplateDetail> {
  const template = await db.query.provisioningTemplatesTable.findFirst({
    where: eq(provisioningTemplatesTable.id, id),
  });

  if (!template) {
    throw new Error(`Template ${id} not found`);
  }

  // Log audit view
  if (actor) {
    await db.insert(provisioningTemplateAuditLogsTable).values({
      templateId: id,
      actor,
      action: "viewed",
      ipAddress: ip,
    });
  }

  const editable = template.status !== "SYSTEM";

  return {
    id: template.id,
    name: template.name,
    vendor: template.vendor,
    serviceType: template.serviceType,
    version: template.version,
    status: template.status as "SYSTEM" | "CUSTOM" | "DRAFT" | "APPROVED" | "DEPRECATED",
    source: template.source,
    description: template.description,
    createdAt: template.createdAt?.toISOString() || "",
    updatedAt: template.updatedAt?.toISOString() || "",
    variablesJson: template.variablesJson,
    validationRulesJson: template.validationRulesJson,
    templateBody: maskSensitiveContent(template.templateBody || ""),
    createdBy: template.createdBy,
    approvedBy: template.approvedBy,
    editable,
  };
}

export async function getTemplateVersions(id: number): Promise<TemplateVersion[]> {
  const versions = await db
    .select()
    .from(provisioningTemplateVersionsTable)
    .where(eq(provisioningTemplateVersionsTable.templateId, id))
    .orderBy((t) => t.createdAt);

  return versions.map((v) => ({
    id: v.id,
    version: v.version,
    status: v.status,
    changedBy: v.changedBy,
    changeReason: v.changeReason,
    createdAt: v.createdAt?.toISOString() || "",
  }));
}

export async function diffTemplateVersions(id: number, versionA: string, versionB: string): Promise<DiffLine[]> {
  const vA = await db
    .select()
    .from(provisioningTemplateVersionsTable)
    .where(
      and(
        eq(provisioningTemplateVersionsTable.templateId, id),
        eq(provisioningTemplateVersionsTable.version, versionA),
      ),
    )
    .limit(1);

  const vB = await db
    .select()
    .from(provisioningTemplateVersionsTable)
    .where(
      and(
        eq(provisioningTemplateVersionsTable.templateId, id),
        eq(provisioningTemplateVersionsTable.version, versionB),
      ),
    )
    .limit(1);

  if (vA.length === 0 || vB.length === 0) {
    throw new Error(`Version ${versionA} or ${versionB} not found`);
  }

  const bodyA = (vA[0].templateBody || "").split("\n");
  const bodyB = (vB[0].templateBody || "").split("\n");

  const diffs: DiffLine[] = [];

  const maxLen = Math.max(bodyA.length, bodyB.length);
  for (let i = 0; i < maxLen; i++) {
    const lineA = bodyA[i] || "";
    const lineB = bodyB[i] || "";

    if (lineA === lineB) {
      diffs.push({ type: "unchanged", line: lineA, lineNumber: i + 1 });
    } else {
      if (lineA) diffs.push({ type: "removed", line: lineA, lineNumber: i + 1 });
      if (lineB) diffs.push({ type: "added", line: lineB, lineNumber: i + 1 });
    }
  }

  return diffs;
}

export async function exportTemplate(id: number, actor: string, ip: string): Promise<TemplateExport> {
  const detail = await getTemplateDetail(id, actor, ip);

  const template = await db.query.provisioningTemplatesTable.findFirst({
    where: eq(provisioningTemplatesTable.id, id),
  });

  if (!template) {
    throw new Error(`Template ${id} not found`);
  }

  // Log audit export
  await db.insert(provisioningTemplateAuditLogsTable).values({
    templateId: id,
    actor,
    action: "exported",
    ipAddress: ip,
  });

  const masked = maskSensitiveContent(template.templateBody || "");

  return {
    template: detail,
    templateBody: masked,
    export: {
      format: "json",
      exportedAt: new Date().toISOString(),
      exportedBy: actor,
    },
  };
}

export async function getTemplateAuditLogs(id: number): Promise<typeof provisioningTemplateAuditLogsTable.$inferSelect[]> {
  return db
    .select()
    .from(provisioningTemplateAuditLogsTable)
    .where(eq(provisioningTemplateAuditLogsTable.templateId, id))
    .orderBy((t) => t.createdAt);
}

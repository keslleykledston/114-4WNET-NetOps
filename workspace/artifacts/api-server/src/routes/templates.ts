import { Router } from "express";
import { db } from "@workspace/db";
import { configTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateConfigTemplateBody,
  UpdateConfigTemplateBody,
  GetConfigTemplateParams,
  UpdateConfigTemplateParams,
  DeleteConfigTemplateParams,
  RenderConfigTemplateParams,
  RenderConfigTemplateBody,
  ListConfigTemplatesQueryParams,
} from "@workspace/api-zod";
import { getRequestSourceIp, logAuditEvent } from "../lib/audit.js";

const router = Router();

router.get("/config-templates", async (req, res) => {
  const query = ListConfigTemplatesQueryParams.safeParse(req.query);
  const templates = await db.select().from(configTemplatesTable).orderBy(configTemplatesTable.name);
  const filtered = templates.filter(t => {
    if (query.success && query.data.type && t.type !== query.data.type) return false;
    return true;
  });
  res.json(filtered.map(t => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })));
});

router.post("/config-templates", async (req, res) => {
  const parsed = CreateConfigTemplateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [tmpl] = await db.insert(configTemplatesTable).values(parsed.data).returning();
  await logAuditEvent({
    action: "template_create",
    objectType: "config_template",
    objectId: String(tmpl.id),
    metadata: { name: tmpl.name, type: tmpl.type, vendor: tmpl.vendor, platform: tmpl.platform, templateLength: tmpl.template.length },
    sourceIp: getRequestSourceIp(req),
  });
  res.status(201).json({ ...tmpl, createdAt: tmpl.createdAt.toISOString(), updatedAt: tmpl.updatedAt.toISOString() });
});

router.get("/config-templates/:id", async (req, res) => {
  const params = GetConfigTemplateParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [tmpl] = await db.select().from(configTemplatesTable).where(eq(configTemplatesTable.id, params.data.id));
  if (!tmpl) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...tmpl, createdAt: tmpl.createdAt.toISOString(), updatedAt: tmpl.updatedAt.toISOString() });
});

router.patch("/config-templates/:id", async (req, res) => {
  const params = UpdateConfigTemplateParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  const parsed = UpdateConfigTemplateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [updated] = await db.update(configTemplatesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(configTemplatesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  await logAuditEvent({
    action: "template_update",
    objectType: "config_template",
    objectId: String(updated.id),
    metadata: { name: updated.name, type: updated.type, vendor: updated.vendor, platform: updated.platform, templateLength: updated.template.length },
    sourceIp: getRequestSourceIp(req),
  });
  res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
});

router.delete("/config-templates/:id", async (req, res) => {
  const params = DeleteConfigTemplateParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  await logAuditEvent({
    action: "template_delete",
    objectType: "config_template",
    objectId: String(params.data.id),
    metadata: { deleted: true },
    sourceIp: getRequestSourceIp(req),
  });
  await db.delete(configTemplatesTable).where(eq(configTemplatesTable.id, params.data.id));
  res.status(204).end();
});

router.post("/config-templates/:id/render", async (req, res) => {
  const params = RenderConfigTemplateParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  const parsed = RenderConfigTemplateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const [tmpl] = await db.select().from(configTemplatesTable).where(eq(configTemplatesTable.id, params.data.id));
  if (!tmpl) { res.status(404).json({ error: "Not found" }); return; }

  const warnings: string[] = [];
  let rendered = tmpl.template;
  const userParams = parsed.data.params as Record<string, string>;

  const varRegex = /\{\{(\s*[\w.]+\s*)\}\}/g;
  const requiredVars = [...rendered.matchAll(varRegex)].map(m => m[1].trim());

  for (const varName of requiredVars) {
    const value = userParams[varName];
    if (value === undefined || value === "") {
      warnings.push(`Variable '${varName}' not provided — left as placeholder`);
    } else {
      rendered = rendered.replaceAll(`{{${varName}}}`, String(value));
      rendered = rendered.replaceAll(`{{ ${varName} }}`, String(value));
    }
  }

  await logAuditEvent({
    action: "template_render",
    objectType: "config_template",
    objectId: String(params.data.id),
    metadata: {
      templateName: tmpl.name,
      warningsCount: warnings.length,
      paramsKeys: Object.keys(userParams),
      renderedLength: rendered.length,
    },
    sourceIp: getRequestSourceIp(req),
  });

  res.json({ rendered, warnings });
});

export default router;

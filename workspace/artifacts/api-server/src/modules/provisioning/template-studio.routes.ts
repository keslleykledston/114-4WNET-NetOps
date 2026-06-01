import express, { Request, Response, Router } from "express";
import { db } from "@workspace/db";
import { templateDraftsTable, templateValidationResultsTable, provisioningTemplatesTable, provisioningTemplateVersionsTable, provisioningTemplateAuditLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requirePermission, requireRole } from "../../lib/auth.js";
import { parseDsl, validateTemplate, generatePreview } from "./template-compiler.service";

const router = Router();

router.get("/studio/drafts", requirePermission("provisioning.read"), async (req: Request, res: Response) => {
  try {
    const drafts = await db.query.templateDraftsTable.findMany({ orderBy: (t) => t.createdAt });
    return res.json(drafts);
  } catch (err) {
    console.error("List drafts error:", err);
    return res.status(500).json({ error: "Failed to list drafts" });
  }
});

router.post("/studio/drafts", requirePermission("provisioning.write"), async (req: Request, res: Response) => {
  try {
    const { draftBody } = req.body;
    if (!draftBody) throw new Error("Missing draftBody");

    const actor = (req as any).user?.email || "unknown";
    const inserted = await db
      .insert(templateDraftsTable)
      .values({ draftBody, status: "DRAFT", createdBy: actor })
      .returning();

    return res.json(inserted[0]);
  } catch (err) {
    console.error("Create draft error:", err);
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.get("/studio/drafts/:id", requirePermission("provisioning.read"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const draft = await db.query.templateDraftsTable.findFirst({ where: eq(templateDraftsTable.id, id) });
    if (!draft) return res.status(404).json({ error: "Draft not found" });
    return res.json(draft);
  } catch (err) {
    return res.status(500).json({ error: "Failed to get draft" });
  }
});

router.put("/studio/drafts/:id", requirePermission("provisioning.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { draftBody } = req.body;
    if (!draftBody) throw new Error("Missing draftBody");

    const updated = await db
      .update(templateDraftsTable)
      .set({ draftBody, updatedAt: new Date() })
      .where(eq(templateDraftsTable.id, id))
      .returning();

    return res.json(updated[0]);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/studio/drafts/:id/validate", requirePermission("provisioning.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const draft = await db.query.templateDraftsTable.findFirst({ where: eq(templateDraftsTable.id, id) });
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    const dsl = parseDsl(draft.draftBody);
    const result = validateTemplate(dsl);

    const saved = await db
      .insert(templateValidationResultsTable)
      .values({
        draftId: id,
        passed: result.passed,
        errorsJson: JSON.stringify(result.errors),
        warningsJson: JSON.stringify(result.warnings),
        validatedBy: (req as any).user?.email || "unknown",
      })
      .returning();

    if (result.passed) {
      await db.update(templateDraftsTable).set({ status: "VALIDATED" }).where(eq(templateDraftsTable.id, id));
    }

    return res.json({ passed: result.passed, errors: result.errors, warnings: result.warnings, validationId: saved[0]?.id });
  } catch (err) {
    console.error("Validate error:", err);
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/studio/drafts/:id/preview", requirePermission("provisioning.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const draft = await db.query.templateDraftsTable.findFirst({ where: eq(templateDraftsTable.id, id) });
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    const dsl = parseDsl(draft.draftBody);
    const preview = generatePreview(dsl);

    return res.json({
      dsl,
      cli: preview.cli,
      preview: preview.preview,
      warnings: preview.warnings,
    });
  } catch (err) {
    console.error("Preview error:", err);
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/studio/drafts/:id/approve", requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const actor = (req as any).user?.email || "unknown";

    const updated = await db
      .update(templateDraftsTable)
      .set({ status: "APPROVED", approvedBy: actor })
      .where(eq(templateDraftsTable.id, id))
      .returning();

    return res.json(updated[0]);
  } catch (err) {
    return res.status(500).json({ error: "Approval failed" });
  }
});

router.post("/studio/drafts/:id/reject", requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { reason } = req.body;

    const updated = await db
      .update(templateDraftsTable)
      .set({ status: "REJECTED", rejectionReason: reason })
      .where(eq(templateDraftsTable.id, id))
      .returning();

    return res.json(updated[0]);
  } catch (err) {
    return res.status(500).json({ error: "Rejection failed" });
  }
});

router.post("/studio/drafts/:id/publish", requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const actor = (req as any).user?.email || "unknown";
    const draft = await db.query.templateDraftsTable.findFirst({ where: eq(templateDraftsTable.id, id) });
    if (!draft) return res.status(404).json({ error: "Draft not found" });
    if (draft.status !== "APPROVED") return res.status(400).json({ error: "Draft must be APPROVED to publish" });

    const dsl = JSON.parse(draft.draftBody);

    const templateResult = await db
      .insert(provisioningTemplatesTable)
      .values({
        name: dsl.meta.name,
        vendor: dsl.meta.vendor,
        serviceType: dsl.meta.service_type,
        version: dsl.meta.version || "1.0.0",
        status: "CUSTOM",
        source: "db",
        templateBody: dsl.template_body,
        variablesJson: JSON.stringify(dsl.inputs),
        validationRulesJson: JSON.stringify(dsl.validation || {}),
        description: dsl.meta.description,
        createdBy: draft.createdBy,
        approvedBy: actor,
      })
      .returning();

    if (templateResult[0]) {
      const versionResult = await db
        .insert(provisioningTemplateVersionsTable)
        .values({
          templateId: templateResult[0].id,
          version: dsl.meta.version || "1.0.0",
          status: "CUSTOM",
          templateBody: dsl.template_body,
          variablesJson: JSON.stringify(dsl.inputs),
          validationRulesJson: JSON.stringify(dsl.validation || {}),
          changedBy: actor,
          changeReason: "Template Studio publish",
        })
        .returning();

      await db
        .insert(provisioningTemplateAuditLogsTable)
        .values({
          templateId: templateResult[0].id,
          actor,
          action: "template_published",
          ipAddress: req.ip,
        });
    }

    return res.json({ message: "Template published", templateId: templateResult[0]?.id });
  } catch (err) {
    console.error("Publish error:", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

export const templateStudioRouter = router;

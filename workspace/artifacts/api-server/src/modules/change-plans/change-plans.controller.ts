import type { Request, Response } from "express";
import { getRequestSourceIp } from "../../lib/audit.js";
import { getSessionUserFromRequest } from "../../lib/auth.js";
import {
  closeChangePlan,
  exportChangePlan,
  getChangePlanById,
  getChangePlanDiff,
  listChangePlans,
  recordChangePlanViewed,
} from "./change-plans.service.js";
import { applyReviewAction, type ReviewAction } from "./change-plan-review.service.js";
import type { ChangePlanListQuery, ChangePlanModule, ChangePlanStatus, ChangePlanWorkflowStatus } from "./change-plans.types.js";

function parseId(value: unknown): number | null {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalString(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = String(raw ?? "").trim();
  return text || undefined;
}

function parseListQuery(req: Request): ChangePlanListQuery {
  const limit = Number(req.query.limit);
  const offset = Number(req.query.offset);
  return {
    module: parseOptionalString(req.query.module) as ChangePlanModule | undefined,
    deviceId: parseId(req.query.deviceId) ?? undefined,
    peerIp: parseOptionalString(req.query.peerIp),
    status: parseOptionalString(req.query.status) as ChangePlanStatus | undefined,
    workflowStatus: parseOptionalString(req.query.workflowStatus) as ChangePlanWorkflowStatus | undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
    offset: Number.isFinite(offset) ? offset : undefined,
  };
}

export async function listChangePlansHandler(req: Request, res: Response): Promise<void> {
  try {
    const result = await listChangePlans(parseListQuery(req));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to list change plans" });
  }
}

export async function getChangePlanHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid change plan ID" });
      return;
    }

    const plan = await getChangePlanById(id);
    if (!plan) {
      res.status(404).json({ error: "Change plan not found" });
      return;
    }

    await recordChangePlanViewed(id, getRequestSourceIp(req));
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load change plan" });
  }
}

export async function getChangePlanDiffHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid change plan ID" });
      return;
    }

    const diff = await getChangePlanDiff(id);
    if (!diff) {
      res.status(404).json({ error: "Change plan diff not found" });
      return;
    }

    res.json({ changePlanId: id, diff });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load change plan diff" });
  }
}

export async function exportChangePlanHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid change plan ID" });
      return;
    }

    const format = req.body && typeof req.body === "object" && req.body.format === "json" ? "json" : "markdown";
    const result = await exportChangePlan({
      id,
      format,
      sourceIp: getRequestSourceIp(req),
    });

    if (result === "not_found") {
      res.status(404).json({ error: "Change plan not found" });
      return;
    }
    if (result === "invalid") {
      res.status(409).json({ error: "Change plan inválido — rollback documental indisponível; export bloqueado." });
      return;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to export change plan" });
  }
}

export async function listDeviceChangePlansHandler(req: Request, res: Response): Promise<void> {
  try {
    const deviceId = parseId(req.params.id);
    if (!deviceId) {
      res.status(400).json({ error: "Invalid device ID" });
      return;
    }

    const result = await listChangePlans({
      ...parseListQuery(req),
      deviceId,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to list device change plans" });
  }
}

export async function closeChangePlanHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid change plan ID" });
      return;
    }

    const plan = await closeChangePlan(id, getRequestSourceIp(req));
    if (!plan) {
      res.status(404).json({ error: "Change plan not found" });
      return;
    }

    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to close change plan" });
  }
}

async function handleReviewAction(req: Request, res: Response, action: ReviewAction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid change plan ID" });
      return;
    }

    const user = await getSessionUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const body = req.body && typeof req.body === "object" ? req.body as { note?: string } : {};
    const result = await applyReviewAction({
      changePlanId: id,
      action,
      note: body.note,
      actorUserId: user.id,
      actorLabel: user.email ?? user.name ?? String(user.id),
      actorRole: user.role,
      permissionsJson: null,
      sourceIp: getRequestSourceIp(req),
    });

    if (result === "not_found") {
      res.status(404).json({ error: "Change plan not found" });
      return;
    }
    if (result === "not_reviewable") {
      res.status(422).json({ error: "Change plan module does not support review workflow", code: "NOT_REVIEWABLE" });
      return;
    }
    if (result === "permission_denied") {
      res.status(403).json({ error: "Permission denied for this review action", code: "PERMISSION_DENIED" });
      return;
    }
    if (result === "invalid_transition") {
      res.status(422).json({ error: "Invalid workflow transition", code: "INVALID_TRANSITION" });
      return;
    }
    if (result === "forbidden_status") {
      res.status(422).json({ error: "Execution status is forbidden in this phase", code: "FORBIDDEN_STATUS" });
      return;
    }
    if (result === "note_required") {
      res.status(422).json({ error: "Review note is required", code: "NOTE_REQUIRED" });
      return;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to apply review action" });
  }
}

export async function submitReviewHandler(req: Request, res: Response): Promise<void> {
  await handleReviewAction(req, res, "submit-review");
}

export async function requestChangesHandler(req: Request, res: Response): Promise<void> {
  await handleReviewAction(req, res, "request-changes");
}

export async function rejectReviewHandler(req: Request, res: Response): Promise<void> {
  await handleReviewAction(req, res, "reject");
}

export async function approveManualHandler(req: Request, res: Response): Promise<void> {
  await handleReviewAction(req, res, "approve-manual");
}

export async function archiveReviewHandler(req: Request, res: Response): Promise<void> {
  await handleReviewAction(req, res, "archive");
}

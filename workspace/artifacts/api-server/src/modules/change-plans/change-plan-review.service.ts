import { desc, eq } from "drizzle-orm";
import {
  changePlanReviewEventsTable,
  changePlansTable,
  db,
} from "@workspace/db";
import type { UserRole } from "@workspace/db";
import { logAuditEvent } from "../../lib/audit.js";
import { checkPermission } from "../../lib/auth.js";
import { getChangePlanById } from "./change-plans.service.js";
import type {
  ChangePlanDetail,
  ChangePlanReviewEvent,
  ChangePlanWorkflowStatus,
} from "./change-plans.types.js";

export const CHANGE_PLAN_WORKFLOW_STATUSES = [
  "draft",
  "ready_for_review",
  "needs_changes",
  "rejected",
  "approved_for_manual_implementation",
  "archived",
] as const;

export const FORBIDDEN_EXECUTION_STATUSES = [
  "approved_for_execution",
  "executing",
  "executed",
  "applied",
  "failed",
  "rollback_executed",
] as const;

export type ReviewAction =
  | "submit-review"
  | "request-changes"
  | "reject"
  | "approve-manual"
  | "archive";

const ACTION_TARGET: Record<ReviewAction, ChangePlanWorkflowStatus> = {
  "submit-review": "ready_for_review",
  "request-changes": "needs_changes",
  reject: "rejected",
  "approve-manual": "approved_for_manual_implementation",
  archive: "archived",
};

const ALLOWED_TRANSITIONS: Record<ChangePlanWorkflowStatus, ChangePlanWorkflowStatus[]> = {
  draft: ["ready_for_review", "archived"],
  ready_for_review: ["needs_changes", "rejected", "approved_for_manual_implementation"],
  needs_changes: ["ready_for_review"],
  rejected: ["archived"],
  approved_for_manual_implementation: ["archived"],
  archived: [],
};

const AUDIT_ACTION: Record<ReviewAction, string> = {
  "submit-review": "change_plan_submitted_for_review",
  "request-changes": "change_plan_needs_changes",
  reject: "change_plan_rejected",
  "approve-manual": "change_plan_approved_for_manual_implementation",
  archive: "change_plan_archived",
};

export type ReviewTransitionResult =
  | ChangePlanDetail
  | "not_found"
  | "not_reviewable"
  | "invalid_transition"
  | "forbidden_status"
  | "note_required"
  | "permission_denied";

export function getWorkflowStatus(metadata: Record<string, unknown>): ChangePlanWorkflowStatus {
  const raw = metadata.workflowStatus;
  if (typeof raw === "string" && CHANGE_PLAN_WORKFLOW_STATUSES.includes(raw as ChangePlanWorkflowStatus)) {
    return raw as ChangePlanWorkflowStatus;
  }
  return "draft";
}

export function isReviewableModule(module: string): boolean {
  return module === "bgp_announcements";
}

export function canPerformReviewAction(input: {
  action: ReviewAction;
  role: UserRole;
  permissionsJson: unknown;
  fromStatus: ChangePlanWorkflowStatus;
}): boolean {
  const user = { role: input.role, permissionsJson: input.permissionsJson as never };
  const canPlan = checkPermission(user, "bgp.announcements.plan");
  const canApprove = checkPermission(user, "bgp.announcements.approve");

  switch (input.action) {
    case "submit-review":
      return canPlan && (input.fromStatus === "draft" || input.fromStatus === "needs_changes");
    case "archive":
      if (input.fromStatus === "draft") return canPlan;
      return canApprove && (input.fromStatus === "rejected" || input.fromStatus === "approved_for_manual_implementation");
    case "request-changes":
    case "reject":
    case "approve-manual":
      return canApprove && input.fromStatus === "ready_for_review";
    default:
      return false;
  }
}

export function validateReviewTransition(input: {
  fromStatus: ChangePlanWorkflowStatus;
  toStatus: ChangePlanWorkflowStatus;
  action: ReviewAction;
  note?: string | null;
}): "ok" | "invalid_transition" | "forbidden_status" | "note_required" {
  const { fromStatus, toStatus } = input;
  if (FORBIDDEN_EXECUTION_STATUSES.includes(toStatus as typeof FORBIDDEN_EXECUTION_STATUSES[number])) {
    return "forbidden_status";
  }
  if (ACTION_TARGET[input.action] !== toStatus) {
    return "invalid_transition";
  }
  const allowed = ALLOWED_TRANSITIONS[fromStatus] ?? [];
  if (!allowed.includes(toStatus)) {
    return "invalid_transition";
  }
  if ((input.action === "reject" || input.action === "request-changes") && !String(input.note ?? "").trim()) {
    return "note_required";
  }
  return "ok";
}

export async function listReviewEvents(changePlanId: number): Promise<ChangePlanReviewEvent[]> {
  const rows = await db
    .select()
    .from(changePlanReviewEventsTable)
    .where(eq(changePlanReviewEventsTable.changePlanId, changePlanId))
    .orderBy(desc(changePlanReviewEventsTable.createdAt));

  return rows.map((row) => ({
    id: row.id,
    changePlanId: row.changePlanId,
    actor: row.actor,
    actorUserId: row.actorUserId,
    previousStatus: row.previousStatus as ChangePlanWorkflowStatus,
    nextStatus: row.nextStatus as ChangePlanWorkflowStatus,
    note: row.note,
    metadata: (row.metadataJson as Record<string, unknown>) ?? {},
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  }));
}

async function persistReviewTransition(input: {
  changePlanId: number;
  module: string;
  deviceId: number;
  sourceObjectType: string | null;
  sourceObjectId: string | null;
  metadata: Record<string, unknown>;
  fromStatus: ChangePlanWorkflowStatus;
  toStatus: ChangePlanWorkflowStatus;
  action: ReviewAction;
  actorLabel: string | null;
  actorUserId: number | null;
  note?: string | null;
  sourceIp?: string | null;
}): Promise<void> {
  const reviewedAt = new Date().toISOString();
  const nextMetadata = {
    ...input.metadata,
    workflowStatus: input.toStatus,
    ticketMarkdown: input.metadata.ticketMarkdown,
    logicalDiff: input.metadata.logicalDiff,
    reviewedBy: input.actorLabel,
    reviewedAt,
    lastReviewNote: input.note ?? null,
  };

  await db.update(changePlansTable)
    .set({
      status: input.toStatus === "archived" ? "closed" : "draft",
      metadataJson: nextMetadata,
      updatedAt: new Date(),
    })
    .where(eq(changePlansTable.id, input.changePlanId));

  await db.insert(changePlanReviewEventsTable).values({
    changePlanId: input.changePlanId,
    actor: input.actorLabel,
    actorUserId: input.actorUserId,
    previousStatus: input.fromStatus,
    nextStatus: input.toStatus,
    note: input.note ?? null,
    metadataJson: {
      module: input.module,
      sourceObjectType: input.sourceObjectType,
      sourceObjectId: input.sourceObjectId,
      action: input.action,
    },
  });

  await logAuditEvent({
    action: AUDIT_ACTION[input.action],
    objectType: "change_plan",
    objectId: String(input.changePlanId),
    metadata: {
      changePlanId: input.changePlanId,
      module: input.module,
      sourceObjectType: input.sourceObjectType,
      sourceObjectId: input.sourceObjectId,
      actor: input.actorLabel,
      previousStatus: input.fromStatus,
      nextStatus: input.toStatus,
      note: input.note ?? null,
      timestamp: reviewedAt,
    },
    sourceIp: input.sourceIp ?? undefined,
  });
}

export async function applyReviewAction(input: {
  changePlanId: number;
  action: ReviewAction;
  note?: string | null;
  actorUserId: number | null;
  actorLabel: string | null;
  actorRole: UserRole;
  permissionsJson: unknown;
  sourceIp?: string | null;
}): Promise<ReviewTransitionResult> {
  const plan = await getChangePlanById(input.changePlanId);
  if (!plan) return "not_found";
  if (!isReviewableModule(plan.module)) return "not_reviewable";

  const metadata = plan.metadata ?? {};
  const fromStatus = getWorkflowStatus(metadata);
  const toStatus = ACTION_TARGET[input.action];

  if (!canPerformReviewAction({
    action: input.action,
    role: input.actorRole,
    permissionsJson: input.permissionsJson,
    fromStatus,
  })) {
    return "permission_denied";
  }

  const validation = validateReviewTransition({
    fromStatus,
    toStatus,
    action: input.action,
    note: input.note,
  });
  if (validation !== "ok") return validation;

  await persistReviewTransition({
    changePlanId: plan.id,
    module: plan.module,
    deviceId: plan.deviceId,
    sourceObjectType: plan.sourceObjectType,
    sourceObjectId: plan.sourceObjectId,
    metadata,
    fromStatus,
    toStatus,
    action: input.action,
    actorLabel: input.actorLabel,
    actorUserId: input.actorUserId,
    note: input.note,
    sourceIp: input.sourceIp,
  });

  const updated = await getChangePlanById(plan.id);
  return updated ?? "not_found";
}

/** Selftest guard: review module must not import execution/ssh/snmp/connector paths. */
export function reviewWorkflowSafetyTokens(): string[] {
  return ["controlledExecution", "ssh2", "net-snmp", "connector", "CONFIG_APPLY"];
}

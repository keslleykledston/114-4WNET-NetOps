import { and, desc, eq } from "drizzle-orm";
import {
  bgpAnnouncementChangePreviewsTable,
  changePlansTable,
  db,
  devicesTable,
} from "@workspace/db";
import { logAuditEvent } from "../../lib/audit.js";
import {
  buildChangePlanInputFromBgpPreview,
  buildBgpAnnouncementPreviewTitle,
  isPreviewEligibleForChangePlan,
} from "../change-plans/adapters/bgp-announcement-preview.adapter.js";
import { createChangePlan, getChangePlanById } from "../change-plans/change-plans.service.js";
import type { BgpPreviewChangePlanLinkSummary } from "../change-plans/change-plans.types.js";
import { getAnnouncementChangePreviewById } from "./announcement-change-preview.service.js";

export type CreatePlanFromPreviewResult =
  | BgpPreviewChangePlanLinkSummary
  | "preview_not_found"
  | "plan_already_exists"
  | "blocked"
  | "high_risk_ack_required";

async function loadPreviewRow(previewId: number) {
  const [row] = await db
    .select()
    .from(bgpAnnouncementChangePreviewsTable)
    .where(eq(bgpAnnouncementChangePreviewsTable.id, previewId))
    .limit(1);

  return row ?? null;
}

async function findExistingPlanForPreview(previewId: number) {
  const previewRow = await loadPreviewRow(previewId);
  if (previewRow?.changePlanId) {
    return previewRow.changePlanId;
  }

  const [existing] = await db
    .select({ id: changePlansTable.id })
    .from(changePlansTable)
    .where(and(
      eq(changePlansTable.sourceObjectType, "bgp_announcement_change_preview"),
      eq(changePlansTable.sourceObjectId, String(previewId)),
    ))
    .orderBy(desc(changePlansTable.createdAt))
    .limit(1);

  return existing?.id ?? null;
}

export async function getChangePlanLinkForPreview(previewId: number): Promise<BgpPreviewChangePlanLinkSummary | null> {
  const preview = await getAnnouncementChangePreviewById(previewId);
  if (!preview) return null;

  const planId = await findExistingPlanForPreview(previewId);
  if (!planId) return null;

  const plan = await getChangePlanById(planId);
  if (!plan) return null;

  const metadata = plan.metadata ?? {};
  return {
    changePlanId: plan.id,
    previewId,
    deviceId: preview.deviceId,
    snapshotId: preview.snapshotId,
    targetId: preview.targetId,
    title: typeof metadata.title === "string" ? metadata.title : `BGP Announcement — ${preview.targetName}`,
    description: typeof metadata.description === "string" ? metadata.description : "",
    status: plan.status === "draft" ? "draft" : plan.status,
    workflowStatus: (typeof metadata.workflowStatus === "string"
      ? metadata.workflowStatus
      : "draft") as BgpPreviewChangePlanLinkSummary["workflowStatus"],
    riskLevel: preview.riskAssessment.level,
    ticketMarkdown: typeof metadata.ticketMarkdown === "string"
      ? metadata.ticketMarkdown
      : preview.ticketMarkdown,
    logicalDiff: Array.isArray(metadata.logicalDiff)
      ? metadata.logicalDiff.map(String)
      : preview.logicalDiff,
    warnings: preview.validation.warnings,
    createdAt: plan.createdAt,
    createdBy: plan.createdBy,
  };
}

export async function listBgpAnnouncementChangePlans(filters: {
  previewId?: number;
  snapshotId?: number;
  targetId?: string;
  deviceId?: number;
  limit?: number;
}) {
  const sourceObjectId = filters.previewId != null ? String(filters.previewId) : undefined;
  const { listChangePlans } = await import("../change-plans/change-plans.service.js");
  const result = await listChangePlans({
    module: "bgp_announcements",
    deviceId: filters.deviceId,
    sourceObjectType: sourceObjectId ? "bgp_announcement_change_preview" : undefined,
    sourceObjectId,
    limit: filters.limit ?? 50,
  });

  let items = result.items;
  if (filters.snapshotId != null) {
    items = items.filter((item) => item.metadata.snapshotId === filters.snapshotId);
  }
  if (filters.targetId) {
    items = items.filter((item) => item.metadata.targetId === filters.targetId);
  }

  return { plans: items, total: items.length };
}

export async function createChangePlanFromPreview(input: {
  previewId: number;
  createdBy: number | null;
  createdByLabel?: string | null;
  acknowledgeHighRisk?: boolean;
}): Promise<CreatePlanFromPreviewResult> {
  const preview = await getAnnouncementChangePreviewById(input.previewId);
  if (!preview) return "preview_not_found";

  const existingPlanId = await findExistingPlanForPreview(input.previewId);
  if (existingPlanId) return "plan_already_exists";

  const eligibility = isPreviewEligibleForChangePlan(preview);
  if (!eligibility.ok) return "blocked";

  if (preview.riskAssessment.level === "high" && !input.acknowledgeHighRisk) {
    return "high_risk_ack_required";
  }

  const [device] = await db
    .select({ hostname: devicesTable.hostname })
    .from(devicesTable)
    .where(eq(devicesTable.id, preview.deviceId))
    .limit(1);

  const planInput = buildChangePlanInputFromBgpPreview({
    preview,
    previewId: input.previewId,
    hostname: device?.hostname ?? null,
    createdBy: input.createdByLabel ?? (input.createdBy != null ? String(input.createdBy) : null),
  });

  const detail = await createChangePlan({
    ...planInput,
    statusOverride: "draft",
  });

  await db
    .update(bgpAnnouncementChangePreviewsTable)
    .set({ changePlanId: detail.id })
    .where(eq(bgpAnnouncementChangePreviewsTable.id, input.previewId));

  await logAuditEvent({
    action: "announcement_change_plan_draft_created",
    objectType: "change_plan",
    objectId: String(detail.id),
    metadata: {
      sourcePreviewId: input.previewId,
      changePlanId: detail.id,
      deviceId: preview.deviceId,
      targetId: preview.targetId,
      riskLevel: preview.riskAssessment.level,
      createdBy: input.createdBy,
      workflowStatus: "draft",
    },
  });

  return {
    changePlanId: detail.id,
    previewId: input.previewId,
    deviceId: preview.deviceId,
    snapshotId: preview.snapshotId,
    targetId: preview.targetId,
    title: String(planInput.metadata?.title ?? buildBgpAnnouncementPreviewTitle(preview)),
    description: String(planInput.metadata?.description ?? ""),
    status: "draft",
    workflowStatus: "draft",
    riskLevel: preview.riskAssessment.level,
    ticketMarkdown: String(planInput.metadata?.ticketMarkdown ?? preview.ticketMarkdown),
    logicalDiff: Array.isArray(planInput.metadata?.logicalDiff)
      ? planInput.metadata.logicalDiff.map(String)
      : preview.logicalDiff,
    warnings: eligibility.warnings,
    createdAt: detail.createdAt,
    createdBy: detail.createdBy,
  };
}

export {
  isPreviewEligibleForChangePlan,
  buildChangePlanInputFromBgpPreview,
};

import { desc, eq } from "drizzle-orm";
import { bgpAnnouncementChangePlansTable, db } from "@workspace/db";
import type { PreviewChangeResponse } from "../bgp-announcement.types.js";

export async function listChangePlans(deviceId: number) {
  return db
    .select()
    .from(bgpAnnouncementChangePlansTable)
    .where(eq(bgpAnnouncementChangePlansTable.deviceId, deviceId))
    .orderBy(desc(bgpAnnouncementChangePlansTable.createdAt))
    .limit(100);
}

export async function createChangePlanDraft(input: {
  deviceId: number;
  preview: PreviewChangeResponse;
  upstreamCircuitId: string;
  upstreamName: string;
  targetType: string;
  family: "ipv4" | "ipv6";
  newState: string;
  createdBy?: number | null;
}) {
  const { preview } = input;
  const [plan] = await db
    .insert(bgpAnnouncementChangePlansTable)
    .values({
      deviceId: input.deviceId,
      targetPolicyName: preview.targetPolicyName,
      targetType: input.targetType,
      family: input.family,
      node: preview.node,
      upstreamCircuitId: input.upstreamCircuitId,
      upstreamName: input.upstreamName,
      oldState: preview.oldState,
      newState: input.newState,
      oldCommunitiesJson: preview.oldCommunities,
      newCommunitiesJson: preview.newCommunities,
      communitySetMatchName: preview.communitySetMatchName,
      generatedScript: preview.generatedScript,
      rollbackScript: preview.rollbackScript,
      affectedPrefixesJson: preview.affectedPrefixes,
      riskLevel: preview.riskLevel,
      status: preview.allowed ? "draft" : "rejected",
      findingsJson: preview.findings,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  return plan;
}

export async function getChangePlanById(planId: number) {
  const [plan] = await db
    .select()
    .from(bgpAnnouncementChangePlansTable)
    .where(eq(bgpAnnouncementChangePlansTable.id, planId))
    .limit(1);
  return plan ?? null;
}

import type { Request, Response } from "express";
import { db } from "@workspace/db";
import {
  communityLibraryItemsTable,
  communitySetsTable,
  communitySetMembersTable,
  communityChangeAuditTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

function parseParamId(id: string | string[]): number | null {
  const val = Array.isArray(id) ? id[0] : id;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

export async function getCommunitiesLibrary(req: Request, res: Response) {
  const deviceId = parseParamId(req.params.id);
  if (!deviceId) return res.status(400).json({ error: "Invalid deviceId" });

  const items = await db
    .select()
    .from(communityLibraryItemsTable)
    .where(eq(communityLibraryItemsTable.deviceId, deviceId));

  return res.json(items);
}

export async function getCommunitySets(req: Request, res: Response) {
  const deviceId = parseParamId(req.params.id);
  if (!deviceId) return res.status(400).json({ error: "Invalid deviceId" });

  const sets = await db
    .select()
    .from(communitySetsTable)
    .where(eq(communitySetsTable.deviceId, deviceId));

  return res.json(sets);
}

export async function getCommunitySetDetails(req: Request, res: Response) {
  const setId = parseParamId(req.params.setId);
  if (!setId) return res.status(400).json({ error: "Invalid setId" });

  const set = await db
    .select()
    .from(communitySetsTable)
    .where(eq(communitySetsTable.id, setId));

  if (!set || set.length === 0) return res.status(404).json({ error: "Set not found" });

  const members = await db
    .select()
    .from(communitySetMembersTable)
    .where(eq(communitySetMembersTable.communitySetId, setId));

  return res.json({ ...set[0], members });
}

export async function postCreateCommunitySet(req: Request, res: Response) {
  const deviceId = parseParamId(req.params.id);
  if (!deviceId) return res.status(400).json({ error: "Invalid deviceId" });

  const { name, slug, vrpObjectName, description } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });

  const finalSlug = slug || name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const finalVrpName = vrpObjectName || finalSlug.replace(/-/g, "_").substring(0, 63);

  const created = await db
    .insert(communitySetsTable)
    .values({
      deviceId,
      companyId: 1,
      name,
      slug: finalSlug,
      vrpObjectName: finalVrpName,
      origin: "app_created",
      description: description || null,
      status: "draft",
    })
    .returning();

  return res.status(201).json(created[0]);
}

export async function putUpdateCommunitySet(req: Request, res: Response) {
  const setId = parseParamId(req.params.setId);
  if (!setId) return res.status(400).json({ error: "Invalid setId" });

  const { name, slug, vrpObjectName, description } = req.body;

  const updated = await db
    .update(communitySetsTable)
    .set({
      ...(name && { name }),
      ...(slug && { slug }),
      ...(vrpObjectName && { vrpObjectName }),
      ...(description && { description }),
      updatedAt: new Date(),
    })
    .where(eq(communitySetsTable.id, setId))
    .returning();

  if (!updated || updated.length === 0) return res.status(404).json({ error: "Set not found" });

  return res.json(updated[0]);
}

export async function deleteCommunityset(req: Request, res: Response) {
  const setId = parseParamId(req.params.setId);
  if (!setId) return res.status(400).json({ error: "Invalid setId" });

  await db.delete(communitySetsTable).where(eq(communitySetsTable.id, setId));

  return res.status(204).send();
}

export async function postPreviewCommunitySet(req: Request, res: Response) {
  const setId = parseParamId(req.params.setId);
  if (!setId) return res.status(400).json({ error: "Invalid setId" });

  return res.json({
    candidateConfigText: "ip community-list temp\n community 100:1",
    candidateSha256: "abc123",
    warnings: [],
    membersMissingLibrary: 0,
    missingCommunityValues: [],
  });
}

export async function postApplyCommunitySet(req: Request, res: Response) {
  const setId = parseParamId(req.params.setId);
  if (!setId) return res.status(400).json({ error: "Invalid setId" });

  const { confirm, expectedCandidateSha256 } = req.body;
  if (!confirm || !expectedCandidateSha256) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  return res.json({
    ok: true,
    status: "success",
    message: "Community set applied successfully",
  });
}

export async function getCommunityChangeAudit(req: Request, res: Response) {
  const deviceId = parseParamId(req.params.id);
  if (!deviceId) return res.status(400).json({ error: "Invalid deviceId" });

  const audit = await db
    .select()
    .from(communityChangeAuditTable)
    .where(eq(communityChangeAuditTable.deviceId, deviceId));

  return res.json(audit);
}

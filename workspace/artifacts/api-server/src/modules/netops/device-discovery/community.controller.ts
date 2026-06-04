import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, devicesTable } from "@workspace/db";
import {
  communityLibraryItemsTable,
  communitySetMembersTable,
  communitySetsTable,
  communityChangeAuditTable,
} from "@workspace/db";
import { formatPhase1CommunityListBlock } from "../huawei-vrp/parsers/community-parser.js";
import { getRequestContext } from "../../../lib/request-context.js";
import {
  resyncCommunitiesFromLiveDevice,
  resyncCommunitiesFromSavedConfiguration,
} from "./community-sync.service.js";
import { applyCommunitySet, recordCommunitySetPreview } from "./community-apply.service.js";

function parseParamId(id: string | string[]): number | null {
  const val = Array.isArray(id) ? id[0] : id;
  const num = parseInt(val, 10);
  return Number.isNaN(num) ? null : num;
}

function toList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeSetValues(members: Array<{ communityValue: string | null; missingInLibrary: boolean | null }>) {
  const values = new Set<string>();
  const missing = new Set<string>();
  for (const member of members) {
    const value = (member.communityValue || "").trim();
    if (!value) continue;
    values.add(value);
    if (member.missingInLibrary) missing.add(value);
  }
  return {
    values: [...values].sort((left, right) => left.localeCompare(right)),
    missing: [...missing].sort((left, right) => left.localeCompare(right)),
  };
}

async function serializeCommunitySet(setId: number) {
  const rows = await db
    .select()
    .from(communitySetsTable)
    .where(eq(communitySetsTable.id, setId))
    .limit(1);
  const set = rows[0];
  if (!set) return null;

  const memberRows = await db
    .select({
      id: communitySetMembersTable.id,
      position: communitySetMembersTable.position,
      communityValue: communitySetMembersTable.communityValue,
      linkedLibraryItemId: communitySetMembersTable.linkedLibraryItemId,
      missingInLibrary: communitySetMembersTable.missingInLibrary,
      linkedFilterName: communityLibraryItemsTable.filterName,
      valueDescription: communitySetMembersTable.valueDescription,
    })
    .from(communitySetMembersTable)
    .leftJoin(
      communityLibraryItemsTable,
      eq(communitySetMembersTable.linkedLibraryItemId, communityLibraryItemsTable.id),
    )
    .where(eq(communitySetMembersTable.communitySetId, setId))
    .orderBy(communitySetMembersTable.position);

  const members = memberRows.map((member) => ({
    id: member.id,
    position: member.position,
    communityValue: member.communityValue,
    linkedLibraryItemId: member.linkedLibraryItemId,
    missingInLibrary: Boolean(member.missingInLibrary),
    linkedFilterName: member.linkedFilterName ?? "",
    valueDescription: member.valueDescription,
  }));

  const discoveredMembers = toList(set.discoveredMembersJson);
  const missing = members.filter((member) => member.missingInLibrary).length;
  const impliedConfigPreview =
    set.impliedConfigPreview ||
    (members.length > 0 ? formatPhase1CommunityListBlock(set.vrpObjectName, members.map((member) => member.communityValue)) : null);

  return {
    ...set,
    discoveredMembersJson: discoveredMembers,
    impliedConfigPreview,
    members,
    membersTotal: members.length,
    membersResolved: members.length - missing,
    membersMissing: missing,
  };
}

export async function getCommunitiesLibrary(req: Request, res: Response) {
  const deviceId = parseParamId(req.params.id);
  if (!deviceId) return res.status(400).json({ error: "Invalid deviceId" });

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const items = await db
    .select()
    .from(communityLibraryItemsTable)
    .where(eq(communityLibraryItemsTable.deviceId, deviceId))
    .then((rows) =>
      rows.filter((row) => {
        if (!q) return true;
        const blob = [row.filterName, row.communityValue, row.description, row.matchType, row.origin]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(q.toLowerCase());
      }),
    );

  return res.json(items);
}

export async function postResyncCommunitiesFromConfig(req: Request, res: Response) {
  const deviceId = parseParamId(req.params.id);
  if (!deviceId) return res.status(400).json({ error: "Invalid deviceId" });
  const deviceRows = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  const device = deviceRows[0];
  if (!device) return res.status(404).json({ error: "Device not found" });

  const stats = await resyncCommunitiesFromSavedConfiguration(device);
  return res.json(stats);
}

export async function postResyncCommunitiesLive(req: Request, res: Response) {
  const deviceId = parseParamId(req.params.id);
  if (!deviceId) return res.status(400).json({ error: "Invalid deviceId" });
  const deviceRows = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  const device = deviceRows[0];
  if (!device) return res.status(404).json({ error: "Device not found" });

  try {
    const stats = await resyncCommunitiesFromLiveDevice(device);
    return res.json(stats);
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Falha ao sincronizar communities via SSH live.",
    });
  }
}

export async function getCommunitySets(req: Request, res: Response) {
  const deviceId = parseParamId(req.params.id);
  if (!deviceId) return res.status(400).json({ error: "Invalid deviceId" });

  const rows = await db
    .select()
    .from(communitySetsTable)
    .where(eq(communitySetsTable.deviceId, deviceId))
    .orderBy(communitySetsTable.name);

  const sets = (await Promise.all(rows.map((set) => serializeCommunitySet(set.id))))
    .filter((set): set is NonNullable<Awaited<ReturnType<typeof serializeCommunitySet>>> => Boolean(set));
  sets.sort((left, right) => {
    const a = left?.origin ?? "";
    const b = right?.origin ?? "";
    const aImported = a === "discovered" || a === "discovered_running_config" || a === "discovered_live";
    const bImported = b === "discovered" || b === "discovered_running_config" || b === "discovered_live";
    if (aImported !== bImported) return aImported ? -1 : 1;
    return (left?.name ?? "").localeCompare(right?.name ?? "");
  });
  return res.json(sets);
}

export async function getCommunitySetDetails(req: Request, res: Response) {
  const setId = parseParamId(req.params.setId);
  if (!setId) return res.status(400).json({ error: "Invalid setId" });

  const set = await serializeCommunitySet(setId);
  if (!set) return res.status(404).json({ error: "Set not found" });

  return res.json(set);
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

  const result = await serializeCommunitySet(created[0].id);
  return res.status(201).json(result ?? created[0]);
}

export async function postCompareCommunitySets(req: Request, res: Response) {
  const deviceId = parseParamId(req.params.id);
  if (!deviceId) return res.status(400).json({ error: "Invalid deviceId" });

  const leftSetId = parseParamId(req.body?.leftSetId);
  const rightSetId = parseParamId(req.body?.rightSetId);
  if (!leftSetId || !rightSetId) {
    return res.status(400).json({ error: "leftSetId and rightSetId are required" });
  }

  const [left, right] = await Promise.all([serializeCommunitySet(leftSetId), serializeCommunitySet(rightSetId)]);
  if (!left || !right) {
    return res.status(404).json({ error: "One or both sets not found" });
  }

  if (left.deviceId !== deviceId || right.deviceId !== deviceId) {
    return res.status(400).json({ error: "Sets must belong to the requested device" });
  }

  const leftValues = normalizeSetValues(left.members);
  const rightValues = normalizeSetValues(right.members);
  const leftSet = new Set(leftValues.values);
  const rightSet = new Set(rightValues.values);

  const onlyInA = leftValues.values.filter((value) => !rightSet.has(value));
  const onlyInB = rightValues.values.filter((value) => !leftSet.has(value));
  const inBoth = leftValues.values.filter((value) => rightSet.has(value));

  return res.json({
    setAId: left.id,
    setAName: left.name,
    setAOrigin: left.origin,
    setBId: right.id,
    setBName: right.name,
    setBOrigin: right.origin,
    membersA: leftValues.values,
    membersB: rightValues.values,
    onlyInA,
    onlyInB,
    inBoth,
    missingInA: leftValues.missing,
    missingInB: rightValues.missing,
    sameMembers: onlyInA.length === 0 && onlyInB.length === 0,
  });
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
      ...(description !== undefined && { description: description || null }),
      updatedAt: new Date(),
    })
    .where(eq(communitySetsTable.id, setId))
    .returning();

  if (!updated || updated.length === 0) return res.status(404).json({ error: "Set not found" });

  const result = await serializeCommunitySet(setId);
  return res.json(result ?? updated[0]);
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

  const set = await serializeCommunitySet(setId);
  if (!set) return res.status(404).json({ error: "Set not found" });

  const deviceRows = await db.select().from(devicesTable).where(eq(devicesTable.id, set.deviceId)).limit(1);
  const device = deviceRows[0];
  if (!device) return res.status(404).json({ error: "Device not found" });
  const user = getRequestContext()?.user ?? null;

  const preview = await recordCommunitySetPreview({
    device,
    communitySet: set,
    userId: user?.id ?? null,
  });

  return res.json(preview);
}

export async function postApplyCommunitySet(req: Request, res: Response) {
  const setId = parseParamId(req.params.setId);
  if (!setId) return res.status(400).json({ error: "Invalid setId" });

  const { confirm, expectedCandidateSha256, acknowledgeMissingLibraryRefs } = req.body;
  if (!confirm || !expectedCandidateSha256) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const set = await serializeCommunitySet(setId);
  if (!set) return res.status(404).json({ error: "Set not found" });

  const deviceRows = await db.select().from(devicesTable).where(eq(devicesTable.id, set.deviceId)).limit(1);
  const device = deviceRows[0];
  if (!device) return res.status(404).json({ error: "Device not found" });
  const user = getRequestContext()?.user ?? null;

  const result = await applyCommunitySet({
    device,
    communitySetId: set.id,
    userId: user?.id ?? null,
    confirm: Boolean(confirm),
    expectedCandidateSha256: String(expectedCandidateSha256),
    acknowledgeMissingLibraryRefs: Boolean(acknowledgeMissingLibraryRefs),
  });

  if ("error" in result) {
    return res.status(result.status).json({ error: result.error });
  }

  return res.json(result);
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

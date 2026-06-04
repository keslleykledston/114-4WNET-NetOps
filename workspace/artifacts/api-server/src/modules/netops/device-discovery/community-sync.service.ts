import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  collectedConfigsTable,
  communityLibraryItemsTable,
  communitySetMembersTable,
  communitySetsTable,
  db,
  type Device,
} from "@workspace/db";
import { runSSHCommandsForDevice } from "../../connectors/connector-aware-transport.js";
import {
  formatPhase1CommunityListBlock,
  parseRunningConfigCommunities,
  usageCountsForLibraryNames,
} from "../huawei-vrp/parsers/community-parser.js";

export const IMPORTED_COMMUNITY_SET_ORIGINS = ["discovered", "discovered_running_config", "discovered_live"] as const;

export interface CommunityResyncStats {
  source: "running_config" | "live_ssh";
  configTextLength: number;
  libraryDiscovered: number;
  libraryInserted: number;
  libraryUpdated: number;
  librarySkippedManual: number;
  libraryDeactivated: number;
  setsDiscovered: number;
  setsInserted: number;
  setsSkippedAppCreated: number;
  setMembersInserted: number;
  setMembersMissingLibrary: number;
}

interface CommunityListGroup {
  listName: string;
  vrpObjectName: string;
  members: Array<{ value: string; valueDescription: string | null }>;
}

function sanitizeSlug(value: string): string {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "clist";
}

function sanitizeVrpObjectName(value: string): string {
  return (value || "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 63) || "CLIST1";
}

function uniqueSlug(base: string, seen: Set<string>): string {
  let candidate = sanitizeSlug(base);
  let suffix = 2;
  while (seen.has(candidate)) {
    candidate = `${sanitizeSlug(base)}-${suffix}`;
    suffix += 1;
  }
  seen.add(candidate);
  return candidate;
}

function groupCommunityLists(configText: string): CommunityListGroup[] {
  const parsed = parseRunningConfigCommunities(configText);
  const order: string[] = [];
  const byName = new Map<string, CommunityListGroup>();

  for (const item of parsed.communityLists) {
    const listName = (item.listName || "").trim();
    const value = (item.value || "").trim();
    if (!listName) continue;
    if (!byName.has(listName)) {
      order.push(listName);
      byName.set(listName, {
        listName,
        vrpObjectName: sanitizeVrpObjectName(listName),
        members: [],
      });
    }
    if (!value || value === "[lista-sem-members-no-backup]") continue;
    const bucket = byName.get(listName);
    if (!bucket) continue;
    const dedupeKey = value.toLowerCase();
    if (bucket.members.some((member) => member.value.toLowerCase() === dedupeKey)) continue;
    bucket.members.push({
      value,
      valueDescription: item.valueDescription?.trim() || null,
    });
  }

  const merged = new Map<string, CommunityListGroup>();
  const mergedOrder: string[] = [];
  for (const listName of order) {
    const group = byName.get(listName);
    if (!group) continue;
    const key = group.vrpObjectName;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        listName: group.listName,
        vrpObjectName: group.vrpObjectName,
        members: [...group.members],
      });
      mergedOrder.push(key);
      continue;
    }
    for (const member of group.members) {
      if (existing.members.some((current) => current.value.toLowerCase() === member.value.toLowerCase())) continue;
      existing.members.push(member);
    }
  }

  return mergedOrder
    .map((key) => merged.get(key))
    .filter((value): value is CommunityListGroup => Boolean(value));
}

export async function latestRunningConfigText(deviceId: number): Promise<string | null> {
  const row = await db
    .select({ rawConfig: collectedConfigsTable.rawConfig })
    .from(collectedConfigsTable)
    .where(eq(collectedConfigsTable.deviceId, deviceId))
    .orderBy(desc(collectedConfigsTable.collectedAt))
    .limit(1);
  const text = row[0]?.rawConfig ?? null;
  return text && text.trim().length > 0 ? text : null;
}

async function resolveLibraryItemId(deviceId: number, communityValue: string): Promise<number | null> {
  const rows = await db
    .select({ id: communityLibraryItemsTable.id })
    .from(communityLibraryItemsTable)
    .where(and(
      eq(communityLibraryItemsTable.deviceId, deviceId),
      eq(communityLibraryItemsTable.communityValue, communityValue),
      inArray(communityLibraryItemsTable.matchType, ["basic", "advanced"]),
    ))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function syncCommunitiesFromConfigText(
  device: Device,
  configText: string,
  source: "running_config" | "live_ssh",
): Promise<CommunityResyncStats> {
  const parsed = parseRunningConfigCommunities(configText);
  const usageCounts = usageCountsForLibraryNames(parsed);
  const importedSetOrigins = Array.from(IMPORTED_COMMUNITY_SET_ORIGINS);
  const filterNames = new Set(parsed.communityFilters.map((entry) => entry.name.trim()).filter(Boolean));
  const groups = groupCommunityLists(configText);

  const stats: CommunityResyncStats = {
    source,
    configTextLength: configText.length,
    libraryDiscovered: parsed.communityFilters.length,
    libraryInserted: 0,
    libraryUpdated: 0,
    librarySkippedManual: 0,
    libraryDeactivated: 0,
    setsDiscovered: groups.length,
    setsInserted: 0,
    setsSkippedAppCreated: 0,
    setMembersInserted: 0,
    setMembersMissingLibrary: 0,
  };

  await db.transaction(async (tx) => {
    const importedSets = await tx
      .select({ id: communitySetsTable.id })
      .from(communitySetsTable)
      .where(and(
        eq(communitySetsTable.deviceId, device.id),
        inArray(communitySetsTable.origin, importedSetOrigins),
      ));
    const importedSetIds = importedSets.map((row) => row.id);
    if (importedSetIds.length > 0) {
      await tx
        .delete(communitySetMembersTable)
        .where(inArray(communitySetMembersTable.communitySetId, importedSetIds));
      await tx
        .delete(communitySetsTable)
        .where(inArray(communitySetsTable.id, importedSetIds));
    }

    await tx
      .delete(communityLibraryItemsTable)
      .where(and(
        eq(communityLibraryItemsTable.deviceId, device.id),
        inArray(communityLibraryItemsTable.origin, importedSetOrigins),
      ));

    for (const filter of parsed.communityFilters) {
      const filterName = (filter.name || "").trim();
      const communityValue = (filter.value || "").trim();
      if (!filterName || !communityValue) continue;

      const existingRows = await tx
        .select()
        .from(communityLibraryItemsTable)
        .where(and(
          eq(communityLibraryItemsTable.deviceId, device.id),
          eq(communityLibraryItemsTable.filterName, filterName),
          eq(communityLibraryItemsTable.communityValue, communityValue),
          eq(communityLibraryItemsTable.matchType, filter.matchType),
        ))
        .limit(1);
      const existing = existingRows[0] ?? null;

      if (existing && (existing.origin || "") === "manual") {
        stats.librarySkippedManual += 1;
        continue;
      }

      if (existing) {
        await tx
          .update(communityLibraryItemsTable)
          .set({
            companyId: 1,
            filterName,
            communityValue,
            matchType: filter.matchType,
            action: filter.action,
            indexOrder: filter.index,
            origin: source,
            description: `Entrada ip community-filter ${filter.matchType} «${filterName}» (${source === "running_config" ? "running-config salvo" : "SSH live"}).`,
            isActive: true,
            usageCount: usageCounts[filterName] ?? 0,
            updatedAt: new Date(),
          })
          .where(eq(communityLibraryItemsTable.id, existing.id));
        stats.libraryUpdated += 1;
        continue;
      }

      await tx.insert(communityLibraryItemsTable).values({
        deviceId: device.id,
        companyId: 1,
        filterName,
        communityValue,
        matchType: filter.matchType,
        action: filter.action,
        indexOrder: filter.index,
        origin: source,
        description: `Entrada ip community-filter ${filter.matchType} «${filterName}» (${source === "running_config" ? "running-config salvo" : "SSH live"}).`,
        isActive: true,
        usageCount: usageCounts[filterName] ?? 0,
      });
      stats.libraryInserted += 1;
    }

    for (const group of groups) {
      const listName = group.listName.trim();
      if (!listName) continue;
      if (!filterNames.has(listName)) {
        const values = group.members.map((member) => member.value.trim()).filter(Boolean);
        if (values.length > 0) {
          const rows = await tx
            .select({ id: communityLibraryItemsTable.id })
            .from(communityLibraryItemsTable)
            .where(and(
              eq(communityLibraryItemsTable.deviceId, device.id),
              eq(communityLibraryItemsTable.filterName, listName),
              inArray(communityLibraryItemsTable.communityValue, values),
              eq(communityLibraryItemsTable.isActive, true),
            ));
          if (rows.length > 0) {
            await tx
              .update(communityLibraryItemsTable)
              .set({ isActive: false, updatedAt: new Date() })
              .where(and(
                eq(communityLibraryItemsTable.deviceId, device.id),
                eq(communityLibraryItemsTable.filterName, listName),
                inArray(communityLibraryItemsTable.communityValue, values),
                eq(communityLibraryItemsTable.isActive, true),
              ));
            stats.libraryDeactivated += rows.length;
          }
        }
      }
    }

    const slugSeen = new Set<string>();
    for (const group of groups) {
      const vrpObjectName = group.vrpObjectName;
      const existingAppCreated = await tx
        .select({ id: communitySetsTable.id })
        .from(communitySetsTable)
        .where(and(
          eq(communitySetsTable.deviceId, device.id),
          eq(communitySetsTable.vrpObjectName, vrpObjectName),
          eq(communitySetsTable.origin, "app_created"),
        ))
        .limit(1);
      if (existingAppCreated[0]) {
        stats.setsSkippedAppCreated += 1;
        continue;
      }

      const slug = uniqueSlug(`d-${group.listName}`, slugSeen);
      const [createdSet] = await tx.insert(communitySetsTable).values({
        deviceId: device.id,
        companyId: 1,
        name: group.listName,
        slug,
        vrpObjectName,
        origin: source,
        discoveredMembersJson: group.members.map((member) => member.value),
        impliedConfigPreview: formatPhase1CommunityListBlock(vrpObjectName, group.members.map((member) => member.value)),
        description: "Importado do running-config / SSH live. Somente leitura.",
        status: "imported",
      }).returning({ id: communitySetsTable.id });
      stats.setsInserted += createdSet ? 1 : 0;

      if (!createdSet) continue;

      let position = 0;
      for (const member of group.members) {
        position += 1;
        const linkedLibraryItemId = await resolveLibraryItemId(device.id, member.value);
        if (!linkedLibraryItemId) {
          stats.setMembersMissingLibrary += 1;
        }
        await tx.insert(communitySetMembersTable).values({
          communitySetId: createdSet.id,
          communityValue: member.value,
          linkedLibraryItemId,
          missingInLibrary: linkedLibraryItemId === null,
          valueDescription: member.valueDescription,
          position,
        });
        stats.setMembersInserted += 1;
      }
    }
  });

  return stats;
}

export async function resyncCommunitiesFromSavedConfiguration(device: Device): Promise<CommunityResyncStats> {
  const configText = await latestRunningConfigText(device.id);
  if (!configText) {
    throw new Error("Nenhum running-config salvo disponível para sincronizar communities.");
  }
  return syncCommunitiesFromConfigText(device, configText, "running_config");
}

export async function resyncCommunitiesFromLiveDevice(device: Device): Promise<CommunityResyncStats> {
  const results = await runSSHCommandsForDevice(device, ["display current-configuration"], {
    commandTimeoutMs: 180_000,
    sessionTimeoutMs: 300_000,
  });
  const runningConfig = results[0]?.output?.trim();
  if (!runningConfig) {
    throw new Error(results[0]?.error || "SSH live não retornou running-config.");
  }
  return syncCommunitiesFromConfigText(device, runningConfig, "live_ssh");
}

export function buildCommunitySetPreview(configName: string, members: Array<{ communityValue: string; missingInLibrary?: boolean }>) {
  const communityValues = members.map((member) => member.communityValue).filter((value) => (value || "").trim().length > 0);
  const candidateConfigText = formatPhase1CommunityListBlock(configName, communityValues);
  const candidateSha256 = createHash("sha256").update(candidateConfigText, "utf8").digest("hex");
  const missingCommunityValues = members
    .filter((member) => Boolean(member.missingInLibrary))
    .map((member) => member.communityValue)
    .filter((value) => (value || "").trim().length > 0);

  return {
    candidateConfigText,
    candidateSha256,
    warnings: missingCommunityValues.length > 0 ? [`${missingCommunityValues.length} community values dependem apenas do set e não foram resolvidos na biblioteca.`] : [],
    membersMissingLibrary: missingCommunityValues.length,
    missingCommunityValues,
  };
}

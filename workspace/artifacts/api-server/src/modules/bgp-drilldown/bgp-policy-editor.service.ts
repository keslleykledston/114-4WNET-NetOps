import { eq } from "drizzle-orm";
import { db, communitySetMembersTable, communitySetsTable, devicesTable } from "@workspace/db";
import { getBgpPeerDrilldown } from "./bgp-peer-drilldown.service.js";
import type { BgpPolicyEditorPreviewRequest, BgpPolicyEditorPreviewResponse } from "./bgp-policy-editor.types.js";
import { buildPolicyEditorPreview, normalizeCommunityName } from "./bgp-policy-editor.utils.js";

export type BgpPolicyEditorPreviewServiceResult =
  | BgpPolicyEditorPreviewResponse
  | "device_not_found"
  | "no_config";

function parseCommunitySetMembers(members: Array<{ communityValue: string; position: number }>): string[] {
  return [...members]
    .sort((left, right) => left.position - right.position)
    .map((member) => normalizeCommunityName(member.communityValue))
    .filter(Boolean);
}

export async function previewBgpPolicyEditor(
  deviceId: number,
  peer: string,
  request: BgpPolicyEditorPreviewRequest,
): Promise<BgpPolicyEditorPreviewServiceResult> {
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) return "device_not_found";

  const drilldown = await getBgpPeerDrilldown(deviceId, peer, {
    source: "snapshot",
    includePolicies: true,
    includePolicyObjects: true,
  });
  if (drilldown === "device_not_found" || drilldown === "no_config") return drilldown;

  const communitySets = await db
    .select()
    .from(communitySetsTable)
    .where(eq(communitySetsTable.deviceId, deviceId));

  const communitySetOptions = await Promise.all(
    communitySets.map(async (set) => {
      const members = await db
        .select()
        .from(communitySetMembersTable)
        .where(eq(communitySetMembersTable.communitySetId, set.id));
      return {
        id: set.id,
        name: set.name,
        vrpObjectName: set.vrpObjectName,
        members: parseCommunitySetMembers(members),
        status: set.status,
        description: set.description ?? null,
      };
    }),
  );

  return buildPolicyEditorPreview({
    deviceId,
    deviceName: device.hostname,
    peerIp: peer,
    peerRemoteAs: drilldown.root.asNumber,
    peerVrf: drilldown.families.find((family) => Boolean(family.effectiveImportPolicy))?.vrf ?? null,
    drilldown,
    communitySets: communitySetOptions,
    pendingEdits: Object.fromEntries(
      (request.nodeEdits ?? []).map((edit) => [edit.nodeId, { nodeId: edit.nodeId, selectedCommunities: edit.selectedCommunities ?? [] }]),
    ),
    routePolicyName: request.routePolicyName ?? null,
  });
}

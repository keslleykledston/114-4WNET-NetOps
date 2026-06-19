import { devicesTable, db } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { compareBgpPeerDrilldownSnapshots } from "../bgp-drilldown/bgp-peer-drilldown-comparison.js";
import {
  getBgpPeerDrilldownSnapshotById,
  listBgpPeerDrilldownHistory,
} from "../bgp-drilldown/bgp-peer-drilldown-cache.js";
import type { CopilotDrilldownCompare } from "./copilot.types.js";
import type { CopilotPeerMatch } from "./copilot.types.js";

export async function comparePeerDrilldownInScope(input: {
  deviceIds: number[];
  peers: CopilotPeerMatch[];
  maxComparisons?: number;
}): Promise<CopilotDrilldownCompare[]> {
  const devices = await db
    .select({ id: devicesTable.id, hostname: devicesTable.hostname })
    .from(devicesTable)
    .where(inArray(devicesTable.id, input.deviceIds));
  const hostnameById = new Map(devices.map((device) => [device.id, device.hostname]));

  const results: CopilotDrilldownCompare[] = [];
  const seen = new Set<string>();

  for (const peer of input.peers) {
    const key = `${peer.deviceId}|${peer.peerIp}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const history = await listBgpPeerDrilldownHistory(peer.deviceId, peer.peerIp, 5);
    if (history.length < 2) continue;

    const rightId = history[0]!.id;
    const leftId = history[1]!.id;
    const [left, right] = await Promise.all([
      getBgpPeerDrilldownSnapshotById(peer.deviceId, peer.peerIp, leftId),
      getBgpPeerDrilldownSnapshotById(peer.deviceId, peer.peerIp, rightId),
    ]);

    if (!left || !right) continue;

    const compare = compareBgpPeerDrilldownSnapshots(leftId, rightId, left, right);
    results.push({
      deviceId: peer.deviceId,
      deviceHostname: hostnameById.get(peer.deviceId) ?? peer.deviceHostname,
      peerIp: peer.peerIp,
      leftCollectedAt: compare.left.collectedAt,
      rightCollectedAt: compare.right.collectedAt,
      importPolicyChanges: compare.importPolicyChanges.length,
      exportPolicyChanges: compare.exportPolicyChanges.length,
      enabledFamilyChanges: compare.enabledFamilyChanges.length,
      newWarnings: compare.warningsAdded,
      resolvedWarnings: compare.warningsRemoved,
    });

    if (results.length >= (input.maxComparisons ?? 4)) break;
  }

  return results;
}

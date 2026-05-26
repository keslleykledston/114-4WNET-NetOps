import { eq } from "drizzle-orm";
import { db, devicesTable } from "@workspace/db";
import { decrypt } from "../../lib/crypto.js";
import { env } from "../../lib/env.js";
import { runSSHCommands } from "../../lib/ssh.js";
import { getBgpPeerDrilldown } from "./bgp-peer-drilldown.service.js";
import {
  BGP_DRILLDOWN_SSH_DETAIL_DISABLED,
  buildSshDetailCommands,
  sanitizeSshDetailResults,
  type BgpPeerSshDetailRequest,
  type BgpPeerSshDetailResult,
} from "./bgp-peer-drilldown-ssh-detail.js";

export type BgpPeerSshDetailServiceResult =
  | BgpPeerSshDetailResult
  | "disabled"
  | "device_not_found"
  | "no_config"
  | "no_commands";

export function isBgpDrilldownSshDetailEnabled(): boolean {
  return env.bgpDrilldownSshDetailEnabled === true;
}

export async function getBgpPeerSshDetail(
  deviceId: number,
  peer: string,
  request: BgpPeerSshDetailRequest,
): Promise<BgpPeerSshDetailServiceResult> {
  if (!isBgpDrilldownSshDetailEnabled()) return "disabled";

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) return "device_not_found";

  const drilldown = await getBgpPeerDrilldown(deviceId, peer, {
    source: "snapshot",
    includePolicies: true,
    includePolicyObjects: true,
  });
  if (drilldown === "device_not_found" || drilldown === "no_config") return drilldown;

  const { commands, warnings } = buildSshDetailCommands(drilldown, request);
  if (commands.length === 0) return "no_commands";

  const password = decrypt(device.passwordEncrypted);
  const results = await runSSHCommands(
    {
      host: device.ipAddress,
      port: device.sshPort ?? 22,
      username: device.username,
      password,
    },
    commands,
    {
      sessionTimeoutMs: 120000,
      commandTimeoutMs: 30000,
      setupTimeoutMs: 10000,
    },
  );

  return {
    contractVersion: "bgp-peer-drilldown-ssh-detail-v1",
    deviceId,
    peer: drilldown.peer,
    source: "ssh_detail",
    collectedAt: new Date().toISOString(),
    requested: request,
    commands,
    evidence: sanitizeSshDetailResults(results),
    warnings,
  };
}

export { BGP_DRILLDOWN_SSH_DETAIL_DISABLED };

import type { Device } from "@workspace/db";
import { runSSHCommandsForDevice } from "../../connectors/connector-aware-transport.js";
import { validateReadonlyCommand } from "../../netops/huawei-vrp/commands.js";
import type { SSHCollectorOutput } from "../l2circuits.types.js";

/** Read-only operational displays — not full config discovery. */
export const L2_OPERATIONAL_SSH_OPS_COMMANDS = [
  "display mpls l2vc verbose",
  "display mpls l2vc",
  "display vsi verbose",
  "display interface brief",
] as const;

export const L2_OPERATIONAL_SSH_CONFIG_COMMANDS = [
  "display current-configuration interface",
  "display interface description",
  "display vlan summary",
] as const;

export async function collectL2OperationalViaSsh(
  device: Device,
  options?: { includeConfig?: boolean },
): Promise<SSHCollectorOutput> {
  // Interface config is always collected so operational refresh can reclassify local VLAN
  // circuits and mark removed dot1q subinterfaces as OPERATIONAL_STALE.
  const commands: string[] = [
    ...L2_OPERATIONAL_SSH_OPS_COMMANDS,
    ...L2_OPERATIONAL_SSH_CONFIG_COMMANDS,
  ];
  if (options?.includeConfig) {
    // Reserved for future extra read-only config commands beyond the baseline interface set.
  }

  for (const cmd of commands) {
    const check = validateReadonlyCommand(cmd);
    if (!check.allowed) {
      throw new Error(`Command not allowed: ${cmd} — ${check.reason}`);
    }
  }

  const results = await runSSHCommandsForDevice(device, [...commands]);
  const output: Record<string, string> = {};
  for (const result of results) {
    if (result.output) {
      output[result.command] = result.output;
    }
  }
  return output as SSHCollectorOutput;
}

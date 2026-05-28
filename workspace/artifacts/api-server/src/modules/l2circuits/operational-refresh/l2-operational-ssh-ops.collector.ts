import type { SSHConfig } from "../../../lib/ssh.js";
import { runSSHCommands } from "../../../lib/ssh.js";
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
] as const;

export async function collectL2OperationalViaSsh(
  sshConfig: SSHConfig,
  options?: { includeConfig?: boolean },
): Promise<SSHCollectorOutput> {
  const commands: string[] = [...L2_OPERATIONAL_SSH_OPS_COMMANDS];
  if (options?.includeConfig) {
    commands.push(...L2_OPERATIONAL_SSH_CONFIG_COMMANDS);
  }

  for (const cmd of commands) {
    const check = validateReadonlyCommand(cmd);
    if (!check.allowed) {
      throw new Error(`Command not allowed: ${cmd} — ${check.reason}`);
    }
  }

  const results = await runSSHCommands(sshConfig, [...commands]);
  const output: Record<string, string> = {};
  for (const result of results) {
    if (result.output) {
      output[result.command] = result.output;
    }
  }
  return output as SSHCollectorOutput;
}

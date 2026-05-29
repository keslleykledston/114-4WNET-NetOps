import type { SSHConfig } from "../../../lib/ssh.js";
import { runSSHCommands } from "../../../lib/ssh.js";
import { validateReadonlyCommand } from "../../netops/huawei-vrp/commands.js";
import type { SSHCollectorOutput } from "../l2circuits.types.js";

export const L2_SSH_COMMANDS = [
  "display mpls l2vc verbose",
  "display mpls l2vc",
  "display vsi verbose",
  "display interface brief",
  "display interface description",
  "display current-configuration interface",
] as const;

export async function collectL2CircuitsViaSsh(sshConfig: SSHConfig): Promise<SSHCollectorOutput> {
  // Validate commands before sending
  for (const cmd of L2_SSH_COMMANDS) {
    const check = validateReadonlyCommand(cmd);
    if (!check.allowed) {
      throw new Error(`Command not allowed: ${cmd} — ${check.reason}`);
    }
  }

  try {
    const results = await runSSHCommands(sshConfig, [...L2_SSH_COMMANDS]);

    const output: Record<string, string> = {};
    for (const result of results) {
      if (result.output) {
        output[result.command] = result.output;
      } else if (result.error) {
        console.warn(`Failed to collect ${result.command}: ${result.error}`);
      }
    }

    return output as SSHCollectorOutput;
  } catch (error) {
    throw new Error(`SSH collection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

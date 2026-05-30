import type { Device } from "@workspace/db";
import type { SSHCommandResult, SSHConfig } from "../../lib/ssh.js";
import { runSSHCommands } from "../../lib/ssh.js";
import { decrypt } from "../../lib/crypto.js";
import { deviceUsesConnector, executeSshCommandForDevice } from "./connector-execution.service.js";

export async function runSSHCommandsForDevice(
  device: Device,
  commands: string[],
  options?: {
    sessionTimeoutMs?: number;
    commandTimeoutMs?: number;
    setupTimeoutMs?: number;
    createdBy?: number | null;
  },
): Promise<SSHCommandResult[]> {
  if (deviceUsesConnector(device)) {
    const results: SSHCommandResult[] = [];
    for (const command of commands) {
      const exec = await executeSshCommandForDevice(device, command, {
        timeoutSeconds: Math.ceil((options?.commandTimeoutMs ?? 120_000) / 1000),
        createdBy: options?.createdBy,
      });
      results.push({
        command,
        output: exec.stdout,
        error: exec.stderr || (exec.success ? undefined : `exit ${exec.exitCode}`),
      });
    }
    return results;
  }

  const password = decrypt(device.passwordEncrypted);
  const sshConfig: SSHConfig = {
    host: device.ipAddress,
    port: device.sshPort ?? 22,
    username: device.username,
    password,
  };
  return runSSHCommands(sshConfig, commands, options);
}

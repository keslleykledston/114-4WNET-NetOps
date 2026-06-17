import type { Device } from "@workspace/db";
import type { SSHCommandResult, SSHConfig } from "../../lib/ssh.js";
import { runSSHCommands } from "../../lib/ssh.js";
import { decrypt } from "../../lib/crypto.js";
import { deviceUsesConnector, executeSshConfigBundleForDevice } from "./connector-execution.service.js";

function splitConnectorCommandBundle(rawBundle: string): Record<string, string> {
  const outputs: Record<string, string> = {};
  if (!rawBundle.trim()) return outputs;

  const sections = rawBundle.split(/\n! === /);
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    const headerEnd = trimmed.indexOf(" ===\n");
    if (headerEnd < 0) continue;
    let command = trimmed.slice(0, headerEnd).trim();
    if (command.startsWith("! === ")) command = command.slice(5).trim();
    const body = trimmed.slice(headerEnd + 5).trim();
    if (command) outputs[command] = body;
  }

  return outputs;
}

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
    const exec = await executeSshConfigBundleForDevice(device, commands, {
      timeoutSeconds: Math.ceil((options?.sessionTimeoutMs ?? 300_000) / 1000),
      createdBy: options?.createdBy,
    });
    const outputs = splitConnectorCommandBundle(exec.stdout);
    const stderr = exec.stderr.trim();
    return commands.map((command) => ({
      command,
      output: outputs[command] ?? "",
      error: outputs[command] ? undefined : stderr || (exec.success ? "empty output" : `exit ${exec.exitCode}`),
    }));
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

import {
  emptyBgpPeers,
  emptyCommunities,
  emptyFilters,
  emptyInterfaces,
} from "./mock-adapter.js";
import type { ReadonlyAdapterContext, ReadonlyCollectionResult, ReadonlySshAdapter } from "./adapter-types.js";
import { validateReadonlyCommands } from "../huawei-vrp/commands.js";

export class SshReadonlyAdapter implements ReadonlySshAdapter {
  validateCommands(commands: string[]) {
    return validateReadonlyCommands(commands);
  }

  async collect(context: ReadonlyAdapterContext, commands: string[]): Promise<ReadonlyCollectionResult> {
    const commandChecks = this.validateCommands(commands);
    const blocked = commandChecks.filter((check) => !check.allowed);

    if (blocked.length > 0) {
      return {
        deviceId: context.device.id,
        status: "blocked",
        executed: false,
        message: "SSH command blocked by NetOps read-only allowlist.",
        commandChecks,
        data: {
          interfaces: emptyInterfaces(),
          bgpPeers: emptyBgpPeers(),
          filters: emptyFilters(),
          communities: emptyCommunities(),
          logs: blocked.map((check) => ({
            level: "WARN",
            scope: "SSH",
            message: `${check.command}: ${check.reason ?? "blocked"}`,
          })),
        },
      };
    }

    if (!context.execute) {
      return {
        deviceId: context.device.id,
        status: "ready",
        executed: false,
        message: "SSH read-only commands validated. Real execution is disabled until FASE 5.",
        commandChecks,
        data: {
          interfaces: emptyInterfaces(),
          bgpPeers: emptyBgpPeers(),
          filters: emptyFilters(),
          communities: emptyCommunities(),
          logs: [{
            level: "INFO",
            scope: "SSH",
            message: "SSH command execution skipped by FASE 4 safety stub.",
          }],
        },
      };
    }

    return {
      deviceId: context.device.id,
      status: "blocked",
      executed: false,
      message: "Real SSH execution is intentionally blocked in FASE 4.",
      commandChecks,
      data: {
        interfaces: emptyInterfaces(),
        bgpPeers: emptyBgpPeers(),
        filters: emptyFilters(),
        communities: emptyCommunities(),
        logs: [{
          level: "WARN",
          scope: "SSH",
          message: "Real SSH execution requested but blocked by phase policy.",
        }],
      },
    };
  }
}

export const sshReadonlyAdapter = new SshReadonlyAdapter();

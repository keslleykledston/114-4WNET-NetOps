import { db, devicesTable, type Device } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { deviceUsesConnector } from "../connectors/connector-execution.service.js";
import { runSSHCommandsForDevice } from "../connectors/connector-aware-transport.js";
import { validateReadonlyCommand } from "../netops/huawei-vrp/commands.js";
import {
  queryBgpRoutes,
  type RouteQueryItem,
} from "../netops/device-discovery/services/bgp-routes.service.js";
import type { CopilotPeerMatch, CopilotPrefixTrace } from "./copilot.types.js";

const MAX_PEERS_PER_DEVICE = 4;
const SSH_TIMEOUT_MS = 45_000;

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export function isCopilotSshOnDemandEnabled(): boolean {
  return parseBoolean(process.env["NETOPS_COPILOT_SSH_ON_DEMAND_ENABLED"], false);
}

export function getCopilotSshOnDemandConfig() {
  return {
    enabled: isCopilotSshOnDemandEnabled(),
    maxPeersPerDevice: Number.parseInt(process.env["NETOPS_COPILOT_SSH_MAX_PEERS"] ?? "", 10) || MAX_PEERS_PER_DEVICE,
    timeoutMs: Number.parseInt(process.env["NETOPS_COPILOT_SSH_TIMEOUT_MS"] ?? "", 10) || SSH_TIMEOUT_MS,
  };
}

function prefixMatches(candidate: string, needle: string): boolean {
  const left = candidate.trim().toLowerCase();
  const right = needle.trim().toLowerCase();
  if (left === right) return true;
  if (left.startsWith(right.split("/")[0] ?? right)) return true;
  return left.includes(right);
}

async function connectorAwareExecutor(device: Device, commands: string[]): Promise<string> {
  const config = getCopilotSshOnDemandConfig();

  for (const cmd of commands) {
    const check = validateReadonlyCommand(cmd);
    if (!check.allowed) {
      throw new Error(`Command not allowed: ${check.reason}`);
    }
  }

  const results = await runSSHCommandsForDevice(device, commands, {
    sessionTimeoutMs: config.timeoutMs,
    commandTimeoutMs: config.timeoutMs,
    setupTimeoutMs: 10_000,
  });

  for (const result of results) {
    if (!result.error && result.output && result.output.trim().length > 0) {
      const lower = result.output.toLowerCase();
      if (!lower.includes("no route") && !lower.includes("not found")) {
        return result.output;
      }
    }
  }

  return "";
}

export interface CopilotSshLiveRouteHit {
  deviceId: number;
  deviceHostname: string;
  peerIp: string;
  vrf: string | null;
  direction: "received" | "advertised";
  prefix: string;
  asPath: string[];
  collectedAt: string;
}

function toLiveHit(input: {
  device: Device;
  peer: CopilotPeerMatch;
  direction: "received" | "advertised";
  item: RouteQueryItem;
  collectedAt: string;
}): CopilotSshLiveRouteHit {
  return {
    deviceId: input.device.id,
    deviceHostname: input.device.hostname,
    peerIp: input.peer.peerIp,
    vrf: input.peer.vrf,
    direction: input.direction,
    prefix: input.item.prefix,
    asPath: input.item.asPath,
    collectedAt: input.collectedAt,
  };
}

export async function queryPrefixLiveRoutesInScope(input: {
  prefix: string;
  deviceIds: number[];
  peers: CopilotPeerMatch[];
  vrfHint?: string | null;
}): Promise<{ hits: CopilotSshLiveRouteHit[]; notes: string[] }> {
  const config = getCopilotSshOnDemandConfig();
  if (!config.enabled) {
    return { hits: [], notes: ["SSH on-demand desabilitado (NETOPS_COPILOT_SSH_ON_DEMAND_ENABLED=false)."] };
  }

  if (!input.prefix || input.deviceIds.length === 0) {
    return { hits: [], notes: ["Prefixo ou escopo de devices ausente para consulta SSH."] };
  }

  const devices = await db
    .select()
    .from(devicesTable)
    .where(inArray(devicesTable.id, input.deviceIds));

  const hits: CopilotSshLiveRouteHit[] = [];
  const notes: string[] = [];
  const filterNeedle = input.prefix.split("/")[0] ?? input.prefix;

  for (const device of devices) {
    if (!device.passwordEncrypted && !deviceUsesConnector(device)) {
      notes.push(`${device.hostname}: credencial SSH indisponivel.`);
      continue;
    }

    const devicePeers = input.peers
      .filter((peer) => peer.deviceId === device.id)
      .slice(0, config.maxPeersPerDevice);

    if (devicePeers.length === 0) {
      notes.push(`${device.hostname}: nenhum peer correlacionado para consulta SSH live.`);
      continue;
    }

    for (const peer of devicePeers) {
      for (const direction of ["received", "advertised"] as const) {
        const collectedAt = new Date().toISOString();
        const response = await queryBgpRoutes(
          device,
          peer.peerIp,
          peer.deviceHostname,
          direction,
          peer.vrf ?? input.vrfHint ?? null,
          {
            receivedRoutes: peer.receivedPrefixes,
            advertisedRoutes: peer.advertisedPrefixes,
          },
          { filter: filterNeedle, limit: 100 },
          connectorAwareExecutor,
        );

        if (response.status !== "ok") {
          if (response.errorMessage) {
            notes.push(`${device.hostname}/${peer.peerIp} ${direction}: ${response.errorMessage}`);
          }
          continue;
        }

        const matched = response.items.filter((item) => prefixMatches(item.prefix, input.prefix));
        for (const item of matched) {
          hits.push(toLiveHit({ device, peer, direction, item, collectedAt }));
        }
      }
    }
  }

  if (hits.length > 0) {
    notes.push(`SSH live: ${hits.length} correspondencia(s) de prefixo em RIB de peers.`);
  } else if (config.enabled) {
    notes.push("SSH live executado — prefixo nao encontrado nas RIBs consultadas.");
  }

  return { hits, notes };
}

export function mergeSshHitsIntoPrefixTraces(input: {
  traces: CopilotPrefixTrace[];
  hits: CopilotSshLiveRouteHit[];
  prefix: string;
  deviceHostnames: Map<number, string>;
}): CopilotPrefixTrace[] {
  const byDevice = new Map(input.traces.map((trace) => [trace.deviceId, { ...trace }]));

  for (const hit of input.hits) {
    let trace = byDevice.get(hit.deviceId);
    if (!trace) {
      trace = {
        prefix: input.prefix,
        deviceId: hit.deviceId,
        deviceHostname: hit.deviceHostname ?? input.deviceHostnames.get(hit.deviceId) ?? `device-${hit.deviceId}`,
        receivedFrom: [],
        advertisedTo: [],
        matrixTargets: [],
        relatedPolicies: [],
        communities: [],
        activeInRouteHistory: false,
        configSnapshotAt: null,
        liveSshVerified: false,
        sshLiveHitCount: 0,
      };
      byDevice.set(hit.deviceId, trace);
    }

    trace.liveSshVerified = true;
    trace.sshLiveHitCount = (trace.sshLiveHitCount ?? 0) + 1;

    const bucket = hit.direction === "advertised" ? trace.advertisedTo : trace.receivedFrom;
    const exists = bucket.some((row) => row.peerIp === hit.peerIp && row.direction === hit.direction);
    if (!exists) {
      bucket.push({
        peerIp: hit.peerIp,
        remoteAs: null,
        direction: hit.direction,
        collectedAt: hit.collectedAt,
      });
    }
    trace.activeInRouteHistory = true;
  }

  return [...byDevice.values()];
}

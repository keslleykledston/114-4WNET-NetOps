import type { Device } from "@workspace/db";
import { db, bgpRouteHistoryTable } from "@workspace/db";
import { runSSHCommands } from "../../../../lib/ssh.js";
import { decrypt } from "../../../../lib/crypto.js";
import { parseHuaweiRoutes } from "../../huawei-vrp/parsers/routes-parser.js";
import { validateReadonlyCommand } from "../../huawei-vrp/commands.js";

export interface RouteQueryRequest {
  direction?: "received" | "advertised";
  limit?: number;
  offset?: number;
  page?: number;
  filter?: string;
}

export interface RouteQueryItem {
  prefix: string;
  asPathType: string;
  asPath: string[];
  origin?: string;
  localPref?: number;
  med?: number;
  source: "ssh";
  confidence: "high" | "medium" | "low";
  evidence: string;
}

export interface RouteQueryResponse {
  peerIp: string;
  peerName?: string;
  direction: "received" | "advertised";
  source: "ssh";
  status: "ok" | "error";
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  excessWarning: boolean;
  warningMessage?: string;
  items: RouteQueryItem[];
  errorMessage?: string;
}

export const MAX_DISPLAY_ROUTES = 200;
export const DEFAULT_LIMIT = 200;

function isIpv6(ip: string): boolean {
  return ip.includes(":");
}

export function buildRouteCommands(
  peerIp: string,
  direction: "received" | "advertised",
  vrf: string | null
): string[] {
  const vrfName = (vrf || "").trim();
  const isV6 = isIpv6(peerIp);
  const directionCmd = direction === "received" ? "received-routes" : "advertised-routes";
  const commands: string[] = [];

  if (!vrfName) {
    if (isV6) {
      commands.push(`display bgp ipv6 routing-table peer ${peerIp} ${directionCmd}`);
    }
    commands.push(`display bgp routing-table peer ${peerIp} ${directionCmd}`);
  } else {
    if (isV6) {
      commands.push(`display bgp vpnv6 vpn-instance ${vrfName} routing-table peer ${peerIp} ${directionCmd}`);
      commands.push(`display bgp ipv6 routing-table vpn-instance ${vrfName} peer ${peerIp} ${directionCmd}`);
    } else {
      commands.push(`display bgp vpnv4 vpn-instance ${vrfName} routing-table peer ${peerIp} ${directionCmd}`);
    }
    commands.push(`display bgp routing-table vpn-instance ${vrfName} peer ${peerIp} ${directionCmd}`);
  }

  return commands;
}

function splitAsPath(asPathStr: string): string[] {
  if (!asPathStr) return [];
  return asPathStr
    .split(/\s+/)
    .map(s => s.replace(/[a-zA-Z?]$/, ""))
    .filter(s => s && /^\d+$/.test(s));
}

async function executeSSHCommands(
  device: Device,
  commands: string[]
): Promise<string> {
  const decrypted = decrypt(device.passwordEncrypted);

  for (const cmd of commands) {
    const check = validateReadonlyCommand(cmd);
    if (!check.allowed) {
      throw new Error(`Command not allowed: ${check.reason}`);
    }
  }

  const results = await runSSHCommands({
    host: device.ipAddress,
    port: device.sshPort,
    username: device.username,
    password: decrypted,
  }, commands);

  for (const result of results) {
    if (!result.error && result.output && result.output.trim().length > 0) {
      if (!result.output.toLowerCase().includes("no route") &&
          !result.output.toLowerCase().includes("not found")) {
        return result.output;
      }
    }
  }

  return "";
}

export async function queryBgpRoutes(
  device: Device,
  peerIp: string,
  peerName: string | undefined,
  direction: "received" | "advertised",
  vrf: string | null | undefined,
  routeCounters: { receivedRoutes?: number | null; advertisedRoutes?: number | null } | null,
  body: RouteQueryRequest,
  executor: (device: Device, commands: string[]) => Promise<string> = executeSSHCommands,
): Promise<RouteQueryResponse> {
  const limit = Math.min(Math.max(1, body.limit ?? DEFAULT_LIMIT), DEFAULT_LIMIT);
  const requestedOffset = typeof body.offset === "number" && Number.isFinite(body.offset)
    ? Math.max(0, Math.floor(body.offset))
    : null;
  const page = requestedOffset === null
    ? Math.max(1, Math.floor(body.page ?? 1))
    : Math.floor(requestedOffset / limit) + 1;
  const offset = requestedOffset ?? (page - 1) * limit;
  const queryTime = new Date();

  try {
    const commands = buildRouteCommands(peerIp, direction, (vrf ?? null) as string | null);
    const output = await executor(device, commands);

    if (!output || output.trim().length === 0) {
      return {
        peerIp,
        peerName,
        direction,
        source: "ssh",
        status: "error",
        total: 0,
        page,
        limit,
        hasNextPage: false,
        hasPreviousPage: false,
        excessWarning: false,
        items: [],
        errorMessage: "No routes found or peer not responding",
      };
    }

    const parsed = parseHuaweiRoutes(output);
    const allRows = parsed.rows;
    const reportedTotal = parsed.reportedTotal;

    const filter = typeof body.filter === "string" ? body.filter.trim().toLowerCase() : "";
    const displayRows = filter
      ? allRows.filter(row =>
          row.prefix.toLowerCase().includes(filter) ||
          row.asPath.toLowerCase().includes(filter) ||
          (row.origin ?? "").toLowerCase().includes(filter)
        )
      : allRows;
    const fullTotal = displayRows.length;
    const reportedHighVolume = (reportedTotal ?? allRows.length) > MAX_DISPLAY_ROUTES;
    let warningMessage: string | undefined;

    if (reportedHighVolume) {
      warningMessage = `Foram detectadas ${reportedTotal ?? allRows.length} rotas; a interface exibe no maximo ${limit} prefixos por pagina.`;
    }

    if (direction === "received" && routeCounters?.receivedRoutes && routeCounters.receivedRoutes > 5000) {
      warningMessage = `Este peer possui alto volume de prefixos recebidos (${routeCounters.receivedRoutes}). A consulta foi limitada a ${limit} por página.`;
    } else if (direction === "advertised" && routeCounters?.advertisedRoutes && routeCounters.advertisedRoutes > 5000) {
      warningMessage = `Este peer possui alto volume de prefixos anunciados (${routeCounters.advertisedRoutes}). A consulta foi limitada a ${limit} por página.`;
    }

    const paginatedRows = displayRows.slice(offset, offset + limit);

    const items: RouteQueryItem[] = paginatedRows.map((row: typeof allRows[0]) => ({
      prefix: row.prefix,
      asPathType: "AS-PATH",
      asPath: splitAsPath(row.asPath),
      origin: row.origin,
      source: "ssh",
      confidence: "high",
      evidence: `SSH ${direction} route from peer ${peerIp}`,
    }));

    // Persist route history to database
    try {
      await db.insert(bgpRouteHistoryTable).values({
        deviceId: device.id,
        peerIp,
        direction,
        queryTime,
        totalRoutes: fullTotal,
        routesReturned: paginatedRows.length,
        routesJson: allRows as any,
        source: "ssh",
        status: "ok",
      });
    } catch (err) {
      // Log but don't fail on persistence
      console.warn(`Failed to persist route history for ${peerIp}:`, err);
    }

    return {
      peerIp,
      peerName,
      direction,
      source: "ssh",
      status: "ok",
      total: displayRows.length,
      page,
      limit,
      hasNextPage: offset + paginatedRows.length < displayRows.length,
      hasPreviousPage: offset > 0,
      excessWarning: reportedHighVolume || (warningMessage ? true : false),
      warningMessage,
      items,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    // Persist error to history
    try {
      await db.insert(bgpRouteHistoryTable).values({
        deviceId: device.id,
        peerIp,
        direction,
        queryTime,
        totalRoutes: 0,
        routesReturned: 0,
        routesJson: [] as any,
        source: "ssh",
        status: "error",
        errorMessage: errorMsg,
      });
    } catch (err) {
      console.warn(`Failed to persist route error for ${peerIp}:`, err);
    }

    return {
      peerIp,
      peerName,
      direction,
      source: "ssh",
      status: "error",
      total: 0,
      page,
      limit,
      hasNextPage: false,
      hasPreviousPage: false,
      excessWarning: false,
      items: [],
      errorMessage: errorMsg,
    };
  }
}

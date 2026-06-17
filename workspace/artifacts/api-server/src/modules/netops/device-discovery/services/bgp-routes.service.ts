import type { Device } from "@workspace/db";
import { db, bgpRouteHistoryTable } from "@workspace/db";
import { runSSHCommandsForDevice } from "../../../connectors/connector-aware-transport.js";
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
/** BGP route dumps via connector can be slow on large tables. */
const ROUTE_QUERY_SSH_TIMEOUT_MS = 300_000;

/** SNMP VRF column often uses Public/GLOBAL for the default BGP table — not a vpn-instance. */
const GLOBAL_VRF_ALIASES = new Set(["", "GLOBAL", "DEFAULT", "_PUBLIC_", "PUBLIC", "Public"]);

export function normalizeRouteQueryVrf(vrf: string | null | undefined): string | null {
  const normalized = (vrf ?? "").trim();
  if (!normalized) return null;
  if (GLOBAL_VRF_ALIASES.has(normalized) || GLOBAL_VRF_ALIASES.has(normalized.toUpperCase())) {
    return null;
  }
  return normalized;
}

function isIpv6(ip: string): boolean {
  return ip.includes(":");
}

export function buildRouteCommands(
  peerIp: string,
  direction: "received" | "advertised",
  vrf: string | null
): string[] {
  const vrfName = normalizeRouteQueryVrf(vrf);
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

function isUsableRouteCommandOutput(output: string): boolean {
  const lower = output.toLowerCase();
  if (!output.trim()) return false;
  if (lower.includes("no route") || lower.includes("not found")) return false;
  if (lower.includes("vpn instance does not exist")) return false;
  if (lower.includes("wrong parameter")) return false;
  if (/\berror:/i.test(output) && !lower.includes("total number of routes")) return false;
  return true;
}

async function executeSSHCommands(
  device: Device,
  commands: string[]
): Promise<string> {
  for (const cmd of commands) {
    const check = validateReadonlyCommand(cmd);
    if (!check.allowed) {
      throw new Error(`Command not allowed: ${check.reason}`);
    }
  }

  const results = await runSSHCommandsForDevice(device, commands, {
    sessionTimeoutMs: ROUTE_QUERY_SSH_TIMEOUT_MS,
    commandTimeoutMs: ROUTE_QUERY_SSH_TIMEOUT_MS,
  });

  for (const result of results) {
    if (!result.error && result.output && isUsableRouteCommandOutput(result.output)) {
      return result.output;
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

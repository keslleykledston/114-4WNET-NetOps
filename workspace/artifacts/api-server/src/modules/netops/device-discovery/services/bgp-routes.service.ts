import type { Device } from "@workspace/db";
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

const MAX_DISPLAY_ROUTES = 200;
const DEFAULT_LIMIT = 200;

function isIpv6(ip: string): boolean {
  return ip.includes(":");
}

function buildRouteCommands(
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
  body: RouteQueryRequest
): Promise<RouteQueryResponse> {
  const limit = Math.min(Math.max(1, body.limit ?? DEFAULT_LIMIT), DEFAULT_LIMIT);
  const page = Math.max(1, body.page ?? 1);
  const offset = (page - 1) * limit;

  try {
    const commands = buildRouteCommands(peerIp, direction, (vrf ?? null) as string | null);
    const output = await executeSSHCommands(device, commands);

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

    const fullTotal = allRows.length;
    const capped = fullTotal > MAX_DISPLAY_ROUTES;
    let warningMessage: string | undefined;

    if (capped) {
      warningMessage = `Foram detectadas ${fullTotal} rotas; por segurança a consulta foi limitada a ${MAX_DISPLAY_ROUTES} nesta interface.`;
    }

    if (direction === "received" && routeCounters?.receivedRoutes && routeCounters.receivedRoutes > 5000) {
      warningMessage = `Este peer possui alto volume de prefixos recebidos (${routeCounters.receivedRoutes}). A consulta foi limitada a ${limit} por página.`;
    } else if (direction === "advertised" && routeCounters?.advertisedRoutes && routeCounters.advertisedRoutes > 5000) {
      warningMessage = `Este peer possui alto volume de prefixos anunciados (${routeCounters.advertisedRoutes}). A consulta foi limitada a ${limit} por página.`;
    }

    const displayRows = capped ? allRows.slice(0, MAX_DISPLAY_ROUTES) : allRows;
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
      hasPreviousPage: page > 1,
      excessWarning: capped || (warningMessage ? true : false),
      warningMessage,
      items,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
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

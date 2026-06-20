import { bgpRouteHistoryTable, db, devicesTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getAnnouncementMatrix } from "../bgp-announcements/announcement-matrix.service.js";
import { parseBgpNetworkStatements } from "../bgp-announcements/parsers/bgp-network.parser.js";
import { loadAnnouncementDeviceContext } from "../bgp-announcements/services/announcement-context.service.js";
import { expandPrefixList } from "../bgp-announcements/resolvers/prefix-expansion.resolver.js";
import { normalizePolicyLookupKey } from "../netops/huawei-vrp/parsers/policy-utils.js";
import type { CopilotPrefixTrace } from "./copilot.types.js";

function prefixMatches(candidate: string, needle: string): boolean {
  const left = candidate.trim().toLowerCase();
  const right = needle.trim().toLowerCase();
  if (left === right) return true;
  if (left.startsWith(right.split("/")[0] ?? right)) return true;
  return left.includes(right);
}

function routesJsonHasPrefix(routesJson: unknown, prefix: string): boolean {
  if (!Array.isArray(routesJson)) return false;
  return routesJson.some((row) => {
    if (!row || typeof row !== "object") return false;
    const p = String((row as { prefix?: string }).prefix ?? "");
    return prefixMatches(p, prefix);
  });
}

export async function tracePrefixInScope(input: {
  prefix: string;
  deviceIds: number[];
}): Promise<CopilotPrefixTrace[]> {
  if (!input.prefix || input.deviceIds.length === 0) return [];

  const devices = await db
    .select({ id: devicesTable.id, hostname: devicesTable.hostname })
    .from(devicesTable)
    .where(inArray(devicesTable.id, input.deviceIds));

  const hostnameById = new Map(devices.map((device) => [device.id, device.hostname]));
  const traces: CopilotPrefixTrace[] = [];

  for (const deviceId of input.deviceIds) {
    const hostname = hostnameById.get(deviceId) ?? `device-${deviceId}`;
    const trace: CopilotPrefixTrace = {
      prefix: input.prefix,
      deviceId,
      deviceHostname: hostname,
      receivedFrom: [],
      advertisedTo: [],
      matrixTargets: [],
      relatedPolicies: [],
      communities: [],
      activeInRouteHistory: false,
      configSnapshotAt: null,
    };

    const historyRows = await db
      .select()
      .from(bgpRouteHistoryTable)
      .where(and(
        eq(bgpRouteHistoryTable.deviceId, deviceId),
        eq(bgpRouteHistoryTable.status, "ok"),
      ))
      .orderBy(desc(bgpRouteHistoryTable.createdAt))
      .limit(40);

    for (const row of historyRows) {
      if (!routesJsonHasPrefix(row.routesJson, input.prefix)) continue;
      trace.activeInRouteHistory = true;
      const bucket = row.direction === "advertised" ? trace.advertisedTo : trace.receivedFrom;
      bucket.push({
        peerIp: row.peerIp,
        remoteAs: null,
        direction: row.direction,
        collectedAt: row.createdAt.toISOString(),
      });
    }

    const matrix = await getAnnouncementMatrix(deviceId, { search: input.prefix });
    if (matrix !== "no_snapshot") {
      for (const row of matrix.rows) {
        const hit = row.affectedPrefixes.some((p) => prefixMatches(p, input.prefix));
        if (!hit && !row.routePolicyName.toLowerCase().includes(input.prefix.split("/")[0] ?? "")) continue;
        const announced = row.cells.some((cell) => cell.state === "on" || cell.state === "default" || cell.state === "p1");
        trace.matrixTargets.push({
          targetName: row.routePolicyName,
          targetType: row.targetType,
          announced,
          reason: row.cells.map((cell) => `${cell.circuitId}:${cell.state}`).join(", ") || "sem celulas",
        });
        trace.relatedPolicies.push(row.routePolicyName);
      }
    }

    const ctx = await loadAnnouncementDeviceContext(deviceId);
    if (ctx !== "no_data") {
      trace.configSnapshotAt = ctx.lastCollectedAt;
      const networks = parseBgpNetworkStatements(ctx.rawConfig);
      for (const network of networks) {
        if (network.routePolicyName && prefixMatches(network.prefix, input.prefix)) {
          trace.relatedPolicies.push(network.routePolicyName);
        }
      }

      for (const policy of Object.values(ctx.parsedConfig.consumers.route_policies)) {
        for (const node of policy.nodes) {
          for (const match of node.matches) {
            const ipPrefix = /if-match\s+ip-prefix\s+(\S+)/i.exec(match);
            if (ipPrefix) {
              const expanded = expandPrefixList(ipPrefix[1], "ipv4", ctx.parsedConfig.catalogs);
              if (expanded.some((p) => prefixMatches(p, input.prefix))) {
                trace.relatedPolicies.push(policy.name);
              }
            }
          }
          for (const apply of node.applies) {
        const community = /apply\s+community\s+(.+)/i.exec(apply);
        if (community?.[1]) trace.communities.push(community[1].trim());
      }
    }
      }
    }

    trace.relatedPolicies = [...new Set(trace.relatedPolicies)];
    trace.communities = [...new Set(trace.communities)];

    if (
      trace.receivedFrom.length > 0
      || trace.advertisedTo.length > 0
      || trace.matrixTargets.length > 0
      || trace.relatedPolicies.length > 0
      || trace.activeInRouteHistory
    ) {
      traces.push(trace);
    }
  }

  return traces;
}

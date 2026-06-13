import { normalizePolicyLookupKey } from "../../netops/huawei-vrp/parsers/policy-utils.js";
import type { AnnouncementFinding } from "../bgp-announcement.types.js";
import type { AnnouncementDeviceContext } from "./announcement-context.service.js";
import { parseNodeApplies } from "../parsers/apply-community.parser.js";
import { parseCircuitCommunity } from "../parsers/community-circuit.parser.js";
import { getCellForUpstream, buildAnnouncementMatrix } from "../resolvers/announcement-matrix.resolver.js";
import { resolveNodeCommunities } from "../resolvers/community-set-matcher.js";
import { expandPrefixList, findPrefixListForNode } from "../resolvers/prefix-expansion.resolver.js";
import { classifyPolicy } from "../resolvers/policy-classifier.js";
import type { UpstreamColumn } from "../resolvers/announcement-matrix.resolver.js";

export interface TargetEvidenceResponse {
  deviceId: number;
  targetKey: string;
  routePolicyName: string;
  node: number;
  family: "ipv4" | "ipv6";
  upstreamCircuitId: string;
  upstreamName: string;
  prefix: string | null;
  prefixesAffected: string[];
  prefixListName: string | null;
  detectedState: string;
  community: string | null;
  actionCode: string | null;
  communitiesDirect: string[];
  communityListName: string | null;
  policyClass: string;
  modifiable: boolean;
  auditOnly: boolean;
  rawApplies: string[];
  source: string;
  lastCollectedAt: string | null;
  collectionAgeMinutes: number | null;
  confidence: string;
  findings: AnnouncementFinding[];
}

export function buildTargetEvidence(
  ctx: AnnouncementDeviceContext,
  upstreams: UpstreamColumn[],
  targetKey: string,
  upstreamCircuitId: string,
): TargetEvidenceResponse | null {
  const { rows } = buildAnnouncementMatrix({
    deviceId: ctx.deviceId,
    parsedConfig: ctx.parsedConfig,
    graph: ctx.graph,
    upstreams,
    collectionAgeMinutes: ctx.collectionAgeMinutes,
    lastCollectedAt: ctx.lastCollectedAt,
  });

  const row = rows.find((r) => r.targetKey === targetKey);
  if (!row) return null;

  const cell = getCellForUpstream(row, upstreamCircuitId);
  const upstream = upstreams.find((u) => u.circuitId === upstreamCircuitId);

  const policyKey = normalizePolicyLookupKey(row.routePolicyName);
  const policy = ctx.parsedConfig.consumers.route_policies[policyKey]
    ?? Object.values(ctx.parsedConfig.consumers.route_policies).find((p: { name: string }) => p.name === row.routePolicyName);
  const nodeObj = policy?.nodes.find((n: { sequence: number | null }) => n.sequence === row.node);
  const classification = classifyPolicy(row.routePolicyName, ctx.graph.networks, ctx.parsedConfig);

  const parsedApplies = nodeObj ? parseNodeApplies(nodeObj.applies) : { directCommunities: [], communityListName: null, rawApplies: [] };
  const resolved = resolveNodeCommunities(
    parsedApplies.directCommunities,
    parsedApplies.communityListName,
    ctx.graph.communityLists,
  );

  const parsedComm = cell?.community ? parseCircuitCommunity(cell.community) : null;

  return {
    deviceId: ctx.deviceId,
    targetKey: row.targetKey,
    routePolicyName: row.routePolicyName,
    node: row.node,
    family: row.family,
    upstreamCircuitId,
    upstreamName: upstream?.displayName ?? upstreamCircuitId,
    prefix: row.affectedPrefixes[0] ?? null,
    prefixesAffected: row.affectedPrefixes,
    prefixListName: row.prefixListName,
    detectedState: cell?.label ?? "—",
    community: cell?.community ?? null,
    actionCode: parsedComm?.actionCode ?? cell?.actionCode ?? null,
    communitiesDirect: resolved.communities,
    communityListName: parsedApplies.communityListName,
    policyClass: classification.policyClass,
    modifiable: classification.modifiable,
    auditOnly: classification.auditOnly,
    rawApplies: parsedApplies.rawApplies,
    source: ctx.source,
    lastCollectedAt: ctx.lastCollectedAt,
    collectionAgeMinutes: ctx.collectionAgeMinutes,
    confidence: cell?.confidence ?? "medium",
    findings: row.findings,
  };
}

export function getExpandedPrefixesForPolicyNode(
  ctx: AnnouncementDeviceContext,
  routePolicyName: string,
  node: number,
  family: "ipv4" | "ipv6",
): string[] {
  const policyKey = normalizePolicyLookupKey(routePolicyName);
  const policy = ctx.parsedConfig.consumers.route_policies[policyKey]
    ?? Object.values(ctx.parsedConfig.consumers.route_policies).find((p: { name: string }) => p.name === routePolicyName);
  if (!policy) return [];

  const nodeObj = policy.nodes.find((n: { sequence: number | null }) => n.sequence === node);
  if (!nodeObj) return [];

  const { listName } = findPrefixListForNode(nodeObj.matches, family);
  if (listName) {
    return expandPrefixList(listName, family, ctx.parsedConfig.catalogs);
  }

  return ctx.graph.networks
    .filter((n: { routePolicyName: string; family: string; prefix: string }) => n.routePolicyName === routePolicyName && n.family === family)
    .map((n: { prefix: string }) => n.prefix);
}

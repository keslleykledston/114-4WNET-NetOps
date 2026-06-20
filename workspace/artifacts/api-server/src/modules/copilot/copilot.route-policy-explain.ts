import { loadAnnouncementDeviceContext } from "../bgp-announcements/services/announcement-context.service.js";
import { expandPrefixList } from "../bgp-announcements/resolvers/prefix-expansion.resolver.js";
import { normalizePolicyLookupKey } from "../netops/huawei-vrp/parsers/policy-utils.js";
import type { CopilotRoutePolicyExplain } from "./copilot.types.js";

function extractPolicyNames(text: string): string[] {
  const matches = [
    ...text.matchAll(/\b(?:route-policy|policy)\s+([A-Za-z0-9._/-]+)/gi),
    ...text.matchAll(/\bRP[-_][A-Za-z0-9._/-]+/gi),
  ];
  return [...new Set(matches.map((match) => match[1] ?? match[0]).filter(Boolean))];
}

export function resolvePolicyNamesFromQuestion(question: string, hints: string[]): string[] {
  const fromQuestion = extractPolicyNames(question);
  return [...new Set([...fromQuestion, ...hints])].slice(0, 4);
}

export async function explainRoutePoliciesInScope(input: {
  question: string;
  deviceIds: number[];
  policyHints?: string[];
}): Promise<CopilotRoutePolicyExplain[]> {
  const policyNames = resolvePolicyNamesFromQuestion(input.question, input.policyHints ?? []);
  if (policyNames.length === 0 && input.policyHints?.length) {
    policyNames.push(...input.policyHints);
  }

  const explains: CopilotRoutePolicyExplain[] = [];

  for (const deviceId of input.deviceIds.slice(0, 8)) {
    const ctx = await loadAnnouncementDeviceContext(deviceId);
    if (ctx === "no_data") continue;

    const policies = ctx.parsedConfig.consumers.route_policies;
    const selected = policyNames.length > 0
      ? policyNames
      : Object.values(policies).slice(0, 3).map((policy) => policy.name);

    for (const name of selected) {
      const policy = policies[normalizePolicyLookupKey(name)];
      if (!policy) continue;

      const nodes = policy.nodes.map((node) => ({
        node: node.sequence,
        action: node.action,
        matches: node.matches,
        applies: node.applies,
      }));

      const ipPrefixes: string[] = [];
      const communityFilters: string[] = [];
      for (const node of policy.nodes) {
        for (const match of node.matches) {
          const ip = /if-match\s+ip-prefix\s+(\S+)/i.exec(match);
          if (ip) {
            ipPrefixes.push(...expandPrefixList(ip[1], "ipv4", ctx.parsedConfig.catalogs));
          }
          const cf = /if-match\s+community-filter\s+(\S+)/i.exec(match);
          if (cf) communityFilters.push(cf[1]);
        }
      }

      const peerBindings = Object.values(ctx.parsedConfig.consumers.bgp_peers)
        .filter((peer) => peer.importPolicy === policy.name || peer.exportPolicy === policy.name)
        .map((peer) => ({
          peerIp: peer.peerIp ?? peer.name ?? `peer-${deviceId}`,
          direction: peer.importPolicy === policy.name ? "import" as const : "export" as const,
        }));

      explains.push({
        deviceId,
        routePolicy: policy.name,
        source: ctx.source,
        collectedAt: ctx.lastCollectedAt,
        nodes,
        dependencies: {
          ipPrefixes: [...new Set(ipPrefixes)].slice(0, 20),
          communityFilters: [...new Set(communityFilters)],
          peerBindings,
        },
      });
    }
  }

  return explains;
}

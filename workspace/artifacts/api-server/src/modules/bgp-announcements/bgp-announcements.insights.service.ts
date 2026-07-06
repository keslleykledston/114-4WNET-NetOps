import { getLatestDiscoverySnapshot } from "../netops/device-discovery/discovery.service.js";
import { loadAnnouncementDeviceContext } from "./services/announcement-context.service.js";
import { buildAnnouncementGraph } from "./bgp-announcements.graph.service.js";
import {
  buildAnnouncementCommunitySetLibrary,
  findExactCommunitySetMatch,
} from "./bgp-announcements.audit.service.js";
import type {
  AnnouncementCommunitySet,
  AnnouncementCommunitySetExactMatch,
  AnnouncementUpstreamAuditPayload,
} from "./bgp-announcements.types.js";

async function loadAnnouncementGraphInput(deviceId: number) {
  const announcementContext = await loadAnnouncementDeviceContext(deviceId);
  if (announcementContext === "no_data") return null;

  const discoverySnapshot = await getLatestDiscoverySnapshot(deviceId);
  return {
    rawConfig: announcementContext.rawConfig,
    localAs: discoverySnapshot?.parsed_config?.bgp_peer_model?.localAs ?? null,
    routePolicies: Object.values(announcementContext.parsedConfig.consumers.route_policies).map((policy) => ({
      name: policy.name,
      nodes: policy.nodes.map((node) => ({
        sequence: node.sequence,
        action: node.action,
        matches: node.matches,
        applies: node.applies,
      })),
    })),
    bgpPeers: discoverySnapshot?.bgpPeers
      ?? Object.values(announcementContext.parsedConfig.consumers.bgp_peers).map((peer) => ({
        peerIp: peer.peerIp ?? peer.name ?? "",
        name: peer.name ?? null,
        role: "unknown",
        importPolicy: peer.importPolicy ?? null,
        exportPolicy: peer.exportPolicy ?? null,
        addressFamily: "unknown",
      })),
  };
}

export async function loadAnnouncementCommunitySets(deviceId: number): Promise<AnnouncementCommunitySet[] | null> {
  const input = await loadAnnouncementGraphInput(deviceId);
  if (!input) return null;
  return buildAnnouncementCommunitySetLibrary(input.rawConfig);
}

export async function resolveAnnouncementCommunitySets(deviceId: number, communities: string[]): Promise<AnnouncementCommunitySetExactMatch | null> {
  const sets = await loadAnnouncementCommunitySets(deviceId);
  if (!sets) return null;
  return findExactCommunitySetMatch(communities, sets);
}

export async function loadAnnouncementUpstreamAudit(deviceId: number): Promise<AnnouncementUpstreamAuditPayload | null> {
  const input = await loadAnnouncementGraphInput(deviceId);
  if (!input) return null;
  const graph = buildAnnouncementGraph({
    rawConfig: input.rawConfig,
    localAs: input.localAs,
    routePolicies: input.routePolicies,
    bgpPeers: input.bgpPeers,
  });
  return graph.payload.upstreamAudit ?? null;
}

export async function loadAnnouncementUpstreamAuditForCircuit(deviceId: number, circuitId: string): Promise<AnnouncementUpstreamAuditPayload | null> {
  const audit = await loadAnnouncementUpstreamAudit(deviceId);
  if (!audit) return null;
  return {
    ...audit,
    byCircuit: Object.fromEntries(Object.entries(audit.byCircuit).filter(([key]) => key === circuitId)),
    findings: audit.findings.filter((finding) => finding.upstreamCircuitId === circuitId),
    totalUpstreamsAudited: Object.keys(audit.byCircuit).includes(circuitId) ? 1 : 0,
    totalAuditFindings: audit.findings.filter((finding) => finding.upstreamCircuitId === circuitId).length,
    totalCriticalAuditFindings: audit.findings.filter((finding) => finding.upstreamCircuitId === circuitId && finding.severity === "error").length,
    localAsUnknownCount: audit.byCircuit[circuitId]?.localAs == null ? 1 : 0,
    prependMismatchCount: audit.findings.filter((finding) => finding.upstreamCircuitId === circuitId && finding.code === "AS_PATH_PREPEND_COUNT_MISMATCH").length,
  };
}

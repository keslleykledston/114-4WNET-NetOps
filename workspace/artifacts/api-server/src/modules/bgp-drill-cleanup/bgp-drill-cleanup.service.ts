import { desc, eq } from "drizzle-orm";
import { bgpPeerCleanupAnalysesTable, collectedConfigsTable, db, devicesTable } from "@workspace/db";
import { getRequestSourceIp, logAuditEvent } from "../../lib/audit.js";
import { getBgpPeerDrilldown } from "../bgp-drilldown/bgp-peer-drilldown.service.js";
import type { BgpPeerDrilldownResult } from "../bgp-drilldown/bgp-peer-drilldown.types.js";
import { getLatestDiscoverySnapshot } from "../netops/device-discovery/discovery.service.js";
import type { DeviceDiscoverySnapshot, BgpPeerSummary } from "../netops/device-discovery/discovery.types.js";
import { computeCleanupRisk } from "./bgp-drill-cleanup.risk.js";
import {
  analyzeBgpPeerCleanupDependencies,
  findTwinPeer,
} from "./bgp-drill-cleanup.dependency-analyzer.js";
import {
  buildBgpPeerCleanupMarkdown,
  buildBgpPeerCleanupScript,
} from "./bgp-drill-cleanup.command-builder.js";
import type {
  BgpPeerCleanupAnalysis,
  BgpPeerCleanupAnalyzeRequest,
  BgpPeerCleanupExportResponse,
  BgpPeerCleanupDependencyBuckets,
} from "./bgp-drill-cleanup.types.js";

function peerFromSnapshot(snapshot: DeviceDiscoverySnapshot, peerIp: string): BgpPeerSummary | null {
  return snapshot.bgpPeers.find((peer) => peer.peerIp === peerIp) ?? null;
}

function snapshotSource(snapshot: DeviceDiscoverySnapshot): BgpPeerCleanupAnalysis["snapshotSource"] {
  return snapshot.sourcesUsed[0] ?? "unknown";
}

function collectPolicies(drilldown: BgpPeerDrilldownResult) {
  const importPolicies = [...new Set(drilldown.effectivePolicies.filter((policy) => policy.direction === "import").map((policy) => policy.policyName))];
  const exportPolicies = [...new Set(drilldown.effectivePolicies.filter((policy) => policy.direction === "export").map((policy) => policy.policyName))];
  return { importPolicies, exportPolicies };
}

function buildBlockedReasons(input: {
  peer: BgpPeerSummary | null;
  twin: BgpPeerCleanupAnalysis["twin"];
  dependencies: BgpPeerCleanupDependencyBuckets;
}): string[] {
  const blocked: string[] = [];
  if (input.peer?.state === "Established") blocked.push("Peer está Established");
  if (input.twin?.state === "Established") blocked.push("Twin AF ainda ativo");
  if (input.dependencies.ambiguous.length > 0) blocked.push("Dependência ambígua exige revisão humana");
  return blocked;
}

function recommendationFor(input: {
  peer: BgpPeerSummary | null;
  blockedReasons: string[];
  dependencies: BgpPeerCleanupDependencyBuckets;
}): "full" | "partial" | "skip" {
  if (input.blockedReasons.length > 0) return "skip";
  if (!input.peer) return "skip";
  const hasPolicies = input.dependencies.exclusive.some((dep) => dep.type === "route-policy")
    || input.dependencies.shared.some((dep) => dep.type === "route-policy")
    || input.dependencies.ambiguous.some((dep) => dep.type === "route-policy");
  if (!hasPolicies && input.dependencies.exclusive.length === 0 && input.dependencies.shared.length === 0) return "partial";
  if (input.dependencies.shared.length === 0 && input.dependencies.ambiguous.length === 0) return "full";
  return "partial";
}

function riskFor(recommendation: "full" | "partial" | "skip", dependencies: BgpPeerCleanupDependencyBuckets): "low" | "medium" | "high" {
  return computeCleanupRisk(recommendation, dependencies.shared.length > 0, dependencies.ambiguous.length > 0);
}

export function classifyBgpPeerCleanup(input: {
  peer: BgpPeerSummary | null;
  twin: BgpPeerCleanupAnalysis["twin"];
  dependencies: BgpPeerCleanupDependencyBuckets;
}): {
  blockedReasons: string[];
  recommendation: BgpPeerCleanupAnalysis["recommendation"];
  riskLevel: BgpPeerCleanupAnalysis["riskLevel"];
} {
  const blockedReasons = buildBlockedReasons(input);
  const recommendation = recommendationFor({ peer: input.peer, blockedReasons, dependencies: input.dependencies });
  const riskLevel = riskFor(recommendation, input.dependencies);
  return { blockedReasons, recommendation, riskLevel };
}

export function buildBgpPeerCleanupAnalysis(input: {
  deviceId: number;
  peer: BgpPeerSummary;
  snapshot: DeviceDiscoverySnapshot;
  drilldown: BgpPeerDrilldownResult;
  dependencies: BgpPeerCleanupDependencyBuckets;
  twin: BgpPeerCleanupAnalysis["twin"];
  recommendation: BgpPeerCleanupAnalysis["recommendation"];
  riskLevel: BgpPeerCleanupAnalysis["riskLevel"];
  blockedReasons: string[];
  warnings: string[];
  analysisId?: number;
}): BgpPeerCleanupAnalysis {
  const peerPolicies = collectPolicies(input.drilldown);
  return {
    analysisId: input.analysisId ?? 0,
    deviceId: input.deviceId,
    peerIp: input.peer.peerIp,
    vrf: input.peer.vrf ?? null,
    afi: input.peer.addressFamily,
    safi: "unicast",
    peerRole: input.peer.role ?? null,
    peerCategory: input.peer.category ?? null,
    state: input.peer.state,
    peerAs: input.peer.remoteAs ?? null,
    importPolicies: peerPolicies.importPolicies,
    exportPolicies: peerPolicies.exportPolicies,
    recommendation: input.recommendation,
    riskLevel: input.riskLevel,
    dependencies: input.dependencies,
    script: { removalCommands: [], validationBefore: [], validationAfter: [], sha256: "" },
    warnings: input.warnings,
    blockedReasons: input.blockedReasons,
    twin: input.twin,
    collectedAt: input.snapshot.finishedAt ?? null,
    snapshotSource: snapshotSource(input.snapshot),
    drilldown: input.drilldown,
  };
}

async function resolveDevice(deviceId: number) {
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  return device ?? null;
}

async function resolveCollectedConfig(deviceId: number) {
  const [row] = await db
    .select()
    .from(collectedConfigsTable)
    .where(eq(collectedConfigsTable.deviceId, deviceId))
    .orderBy(desc(collectedConfigsTable.collectedAt))
    .limit(1);
  return row ?? null;
}

function fallbackAnalysis(deviceId: number, peerIp: string): BgpPeerCleanupAnalysis {
  return {
    analysisId: 0,
    deviceId,
    peerIp,
    vrf: null,
    afi: "ipv4",
    safi: "unicast",
    peerRole: null,
    peerCategory: null,
    state: "Unknown",
    peerAs: null,
    importPolicies: [],
    exportPolicies: [],
    recommendation: "skip",
    riskLevel: "high",
    dependencies: { exclusive: [], shared: [], ambiguous: [] },
    script: { removalCommands: [], validationBefore: [], validationAfter: [], sha256: "" },
    warnings: ["Device ou peer não encontrado"],
    blockedReasons: ["Device ou peer não encontrado"],
    twin: null,
    collectedAt: null,
    snapshotSource: "unknown",
  };
}

function toStoredAnalysis(analysis: BgpPeerCleanupAnalysis): Record<string, unknown> {
  return {
    analysisId: analysis.analysisId,
    deviceId: analysis.deviceId,
    peerIp: analysis.peerIp,
    vrf: analysis.vrf,
    afi: analysis.afi,
    safi: analysis.safi,
    peerRole: analysis.peerRole,
    peerCategory: analysis.peerCategory,
    state: analysis.state,
    peerAs: analysis.peerAs,
    importPolicies: analysis.importPolicies,
    exportPolicies: analysis.exportPolicies,
    recommendation: analysis.recommendation,
    riskLevel: analysis.riskLevel,
    dependencies: analysis.dependencies,
    script: analysis.script,
    warnings: analysis.warnings,
    blockedReasons: analysis.blockedReasons,
    twin: analysis.twin,
    collectedAt: analysis.collectedAt,
    snapshotSource: analysis.snapshotSource,
  };
}

export async function analyzeBgpPeerCleanup(input: {
  deviceId: number;
  peerIp: string;
  request?: BgpPeerCleanupAnalyzeRequest;
  createdBy?: string | null;
}): Promise<BgpPeerCleanupAnalysis | "device_not_found" | "peer_not_found" | "no_config" | "peer_established_protected"> {
  const device = await resolveDevice(input.deviceId);
  if (!device) return "device_not_found";

  const snapshot = await getLatestDiscoverySnapshot(input.deviceId);
  if (!snapshot) return "no_config";

  const peer = peerFromSnapshot(snapshot, input.peerIp);
  if (!peer) return "peer_not_found";
  if (peer.state === "Established") return "peer_established_protected";

  const drilldown = await getBgpPeerDrilldown(input.deviceId, input.peerIp, {
    source: "snapshot",
    includePolicies: true,
    includePolicyObjects: true,
  });
  if (drilldown === "device_not_found" || drilldown === "no_config") return "no_config";

  const peerPolicies = collectPolicies(drilldown);
  const dependencies = analyzeBgpPeerCleanupDependencies({
    targetPeerIp: input.peerIp,
    snapshot,
    drilldown,
  });
  const twin = findTwinPeer({ snapshot, targetPeer: peer });
  const { blockedReasons, recommendation, riskLevel } = classifyBgpPeerCleanup({ peer, twin, dependencies });
  const analysisBase = buildBgpPeerCleanupAnalysis({
    deviceId: input.deviceId,
    peer,
    snapshot,
    drilldown,
    dependencies,
    twin,
    recommendation,
    riskLevel,
    blockedReasons,
    warnings: [
      ...(drilldown.warnings ?? []),
      ...(twin?.state === "Established" ? ["Twin AF ainda ativo"] : []),
    ],
  });

  analysisBase.script = buildBgpPeerCleanupScript({ analysis: analysisBase });

  const [inserted] = await db.insert(bgpPeerCleanupAnalysesTable).values({
    deviceId: input.deviceId,
    peerIp: peer.peerIp,
    vrf: analysisBase.vrf,
    afi: analysisBase.afi,
    safi: analysisBase.safi,
    state: analysisBase.state,
    recommendation: analysisBase.recommendation,
    riskLevel: analysisBase.riskLevel,
    analysisJson: toStoredAnalysis(analysisBase),
    createdBy: input.createdBy ?? null,
  }).returning();

  if (!inserted) return analysisBase;

  const analysis = { ...analysisBase, analysisId: inserted.id };
  await db
    .update(bgpPeerCleanupAnalysesTable)
    .set({ analysisJson: toStoredAnalysis(analysis) })
    .where(eq(bgpPeerCleanupAnalysesTable.id, inserted.id));

  return analysis;
}

export async function getBgpPeerCleanupAnalysisById(id: number): Promise<BgpPeerCleanupAnalysis | null> {
  const [row] = await db.select().from(bgpPeerCleanupAnalysesTable).where(eq(bgpPeerCleanupAnalysesTable.id, id)).limit(1);
  if (!row) return null;
  const analysis = row.analysisJson as BgpPeerCleanupAnalysis;
  return { ...analysis, analysisId: row.id };
}

export async function exportBgpPeerCleanupAnalysisById(input: {
  id: number;
  createdBy?: string | null;
  sourceIp?: string | null;
}): Promise<BgpPeerCleanupExportResponse | "not_found"> {
  const analysis = await getBgpPeerCleanupAnalysisById(input.id);
  if (!analysis) return "not_found";

  const markdown = buildBgpPeerCleanupMarkdown({ analysis });
  await db.update(bgpPeerCleanupAnalysesTable)
    .set({ exportedAt: new Date() })
    .where(eq(bgpPeerCleanupAnalysesTable.id, input.id));

  await logAuditEvent({
    action: "bgp_cleanup_script_exported",
    objectType: "bgp_cleanup_analysis",
    objectId: String(input.id),
    metadata: { deviceId: analysis.deviceId, peerIp: analysis.peerIp, recommendation: analysis.recommendation },
    sourceIp: input.sourceIp ?? undefined,
  });

  return {
    analysisId: analysis.analysisId,
    markdown,
    exportedAt: new Date().toISOString(),
  };
}

export async function auditBgpCleanupCreation(analysis: BgpPeerCleanupAnalysis, sourceIp?: string | null) {
  await logAuditEvent({
    action: "bgp_cleanup_analysis_created",
    objectType: "bgp_cleanup_analysis",
    objectId: String(analysis.analysisId),
    metadata: {
      deviceId: analysis.deviceId,
      peerIp: analysis.peerIp,
      recommendation: analysis.recommendation,
      riskLevel: analysis.riskLevel,
    },
    sourceIp: sourceIp ?? undefined,
  });
}

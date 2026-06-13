import type { Request, Response } from "express";
import {
  assertMatrixEnabled,
  assertPreviewEnabled,
  isBgpAnnouncementMatrixEnabled,
  isBgpAnnouncementPreviewEnabled,
  isBgpUpstreamAuditEnabled,
} from "./bgp-announcement.gate.js";
import {
  diffAnnouncementSnapshots,
  diffSnapshotToLatest,
  getAnnouncementSnapshotTimeline,
} from "./announcement-snapshot-diff.service.js";
import {
  findExactCommunitySetMatch,
  getAnnouncementMatrix,
  getExpandedPrefixes,
  getLatestMatrixSnapshotSummary,
  getMatrixSnapshotById,
  getTargetEvidence,
  listCommunitySets,
  listMatrixSnapshotSummaries,
  loadAnnouncementDeviceContext,
  previewAnnouncementChange,
  refreshAnnouncementMatrixSnapshot,
  resolveCommunitySetSemantics,
  syncCommunitySetsFromGraph,
} from "./announcement-matrix.service.js";
import {
  createChangePlanDraft,
  getChangePlanById,
  listChangePlans,
} from "./services/announcement-change-plan.service.js";
import { runUpstreamAudit } from "../bgp-upstream-audit/bgp-upstream-audit.service.js";
import type { ParsedPolicyDependencyConfig } from "../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import { ensureUpstreamCircuitsInDb } from "./services/upstream-circuit-discovery.service.js";
import {
  createAnnouncementChangePreview,
  getAnnouncementChangePreviewById,
  listAnnouncementChangePreviews,
} from "./announcement-change-preview.service.js";
import {
  createChangePlanFromPreview,
  getChangePlanLinkForPreview,
  listBgpAnnouncementChangePlans,
} from "./announcement-change-plan-link.service.js";
import type { ChangePreviewActionType } from "./bgp-announcement.types.js";
import { logAuditEvent } from "../../lib/audit.js";
import { getRequestContext } from "../../lib/request-context.js";

export async function getAnnouncementFeature(_req: Request, res: Response) {
  res.json({
    enabled: isBgpAnnouncementMatrixEnabled(),
    previewEnabled: isBgpAnnouncementPreviewEnabled(),
    upstreamAuditEnabled: isBgpUpstreamAuditEnabled(),
  });
}

export async function getMatrix(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const deviceId = Number(req.query.deviceId ?? req.params.deviceId);
  if (!Number.isFinite(deviceId)) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }

  const snapshotIdRaw = req.query.snapshotId;
  const snapshotId = snapshotIdRaw != null ? Number(snapshotIdRaw) : undefined;

  const result = await getAnnouncementMatrix(deviceId, {
    family: typeof req.query.family === "string" ? req.query.family : undefined,
    targetType: typeof req.query.targetType === "string" ? req.query.targetType : undefined,
    search: typeof req.query.search === "string" ? req.query.search : undefined,
  }, Number.isFinite(snapshotId) ? { snapshotId } : undefined);

  if (result === "device_not_found") {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  if (result === "no_snapshot") {
    res.status(404).json({ error: "No matrix snapshot available. Use Atualizar matriz to build from persisted data." });
    return;
  }

  res.json(result);
}

export async function getLatestSnapshot(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const deviceId = Number(req.query.deviceId);
  if (!Number.isFinite(deviceId)) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }

  const summary = await getLatestMatrixSnapshotSummary(deviceId);
  if (!summary) {
    res.status(404).json({ error: "No matrix snapshot available" });
    return;
  }

  res.json(summary);
}

export async function listSnapshots(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const deviceId = Number(req.query.deviceId);
  if (!Number.isFinite(deviceId)) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }

  const limit = Number(req.query.limit ?? 20);
  const snapshots = await listMatrixSnapshotSummaries(deviceId, Number.isFinite(limit) ? limit : 20);
  res.json({ deviceId, snapshots });
}

export async function getSnapshotById(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const snapshotId = Number(req.params.id);
  const deviceId = req.query.deviceId != null ? Number(req.query.deviceId) : undefined;
  if (!Number.isFinite(snapshotId)) {
    res.status(400).json({ error: "Invalid snapshot id" });
    return;
  }

  const matrix = await getMatrixSnapshotById(snapshotId, Number.isFinite(deviceId) ? deviceId : undefined);
  if (matrix === "snapshot_not_found") {
    res.status(404).json({ error: "Matrix snapshot not found" });
    return;
  }
  if (matrix === "snapshot_incompatible") {
    res.status(409).json({ error: "Snapshot format incompatible; refresh required" });
    return;
  }

  res.json(matrix);
}

export async function postRefreshSnapshot(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const body = req.body ?? {};
  const deviceId = Number(body.deviceId ?? req.query.deviceId);
  if (!Number.isFinite(deviceId)) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }

  const result = await refreshAnnouncementMatrixSnapshot(deviceId);
  if (result === "device_not_found") {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  if (result === "no_data") {
    res.status(422).json({
      error: "Insufficient persisted data to build matrix snapshot",
      code: "NO_PERSISTED_DATA",
      warnings: [
        "Nenhum discovery snapshot ou collected_config encontrado para este device.",
        "Popule inventário via config collection ou discovery em outro módulo antes de atualizar a matriz.",
      ],
    });
    return;
  }

  const user = getRequestContext()?.user;
  await logAuditEvent({
    action: "announcement_matrix_snapshot_refresh",
    objectType: "bgp_announcement_matrix_snapshot",
    objectId: String(result.snapshotId),
    metadata: {
      deviceId,
      status: result.status,
      counters: result.counters,
      warnings: result.warnings,
      refreshMode: "database_only",
      userId: user?.id ?? null,
    },
  });

  res.status(201).json(result);
}

export async function getEvidence(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const deviceId = Number(req.query.deviceId);
  const targetKey = String(req.query.targetKey ?? "");
  const upstreamCircuitId = String(req.query.upstreamCircuitId ?? "");
  if (!Number.isFinite(deviceId) || !targetKey || !upstreamCircuitId) {
    res.status(400).json({ error: "deviceId, targetKey and upstreamCircuitId required" });
    return;
  }

  const evidence = await getTargetEvidence(deviceId, targetKey, upstreamCircuitId);
  if (evidence === "no_snapshot") {
    res.status(404).json({ error: "No data available" });
    return;
  }
  if (!evidence) {
    res.status(404).json({ error: "Target not found" });
    return;
  }

  res.json(evidence);
}

export async function getExpandedPrefixesHandler(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const deviceId = Number(req.query.deviceId);
  const routePolicyName = String(req.query.routePolicyName ?? "");
  const node = Number(req.query.node);
  const family = req.query.family === "ipv6" ? "ipv6" : "ipv4";

  if (!Number.isFinite(deviceId) || !routePolicyName || !Number.isFinite(node)) {
    res.status(400).json({ error: "deviceId, routePolicyName and node required" });
    return;
  }

  const prefixes = await getExpandedPrefixes(deviceId, routePolicyName, node, family);
  if (prefixes === "no_snapshot") {
    res.status(404).json({ error: "No data available" });
    return;
  }

  res.json({ routePolicyName, node, family, prefixes });
}

export async function postPreviewChange(req: Request, res: Response) {
  const gate = assertPreviewEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const body = req.body ?? {};
  const deviceId = Number(body.deviceId);
  if (!Number.isFinite(deviceId)) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }

  const result = await previewAnnouncementChange({
    deviceId,
    targetPolicyName: String(body.targetPolicyName ?? ""),
    node: Number(body.node),
    family: body.family === "ipv6" ? "ipv6" : "ipv4",
    upstreamCircuitId: String(body.upstreamCircuitId ?? "").padStart(2, "0").slice(-2),
    newState: body.newState,
  });

  if (result === "no_snapshot") {
    res.status(404).json({ error: "No discovery snapshot or config" });
    return;
  }
  if (result === "blocked") {
    res.status(422).json({ error: "Collection too old for preview", code: "COLLECTION_STALE" });
    return;
  }

  await logAuditEvent({
    action: "announcement_preview_created",
    objectType: "bgp_announcement",
    objectId: String(deviceId),
    metadata: { targetPolicy: body.targetPolicyName, allowed: result.allowed },
  });

  res.json(result);
}

export async function postChangePreview(req: Request, res: Response) {
  const gate = assertPreviewEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const body = req.body ?? {};
  const deviceId = Number(body.deviceId);
  if (!Number.isFinite(deviceId) || !body.targetId || !body.actionType) {
    res.status(400).json({ error: "deviceId, targetId and actionType required" });
    return;
  }

  const user = getRequestContext()?.user;
  const result = await createAnnouncementChangePreview({
    deviceId,
    snapshotId: body.snapshotId != null ? Number(body.snapshotId) : undefined,
    targetId: String(body.targetId),
    actionType: String(body.actionType) as ChangePreviewActionType,
    upstreamCircuitId: body.upstreamCircuitId != null ? String(body.upstreamCircuitId) : undefined,
    newState: body.newState,
    community: body.community != null ? String(body.community) : undefined,
    prependCount: body.prependCount != null ? Number(body.prependCount) : undefined,
  }, user?.id ?? null);

  if (result === "snapshot_not_found") {
    res.status(404).json({ error: "Matrix snapshot not found" });
    return;
  }
  if (result === "target_not_found") {
    res.status(404).json({ error: "Target not found in snapshot" });
    return;
  }
  if (result === "invalid_request") {
    res.status(400).json({ error: "Invalid actionType" });
    return;
  }

  await logAuditEvent({
    action: "announcement_change_preview_created",
    objectType: "bgp_announcement_change_preview",
    objectId: String(result.id),
    metadata: {
      deviceId,
      targetId: result.targetId,
      actionType: result.actionType,
      riskLevel: result.riskAssessment.level,
      blocked: result.riskAssessment.blocked,
    },
  });

  res.status(201).json(result);
}

export async function getChangePreviewById(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const previewId = Number(req.params.id);
  if (!Number.isFinite(previewId)) {
    res.status(400).json({ error: "Invalid preview id" });
    return;
  }

  const preview = await getAnnouncementChangePreviewById(previewId);
  if (!preview) {
    res.status(404).json({ error: "Change preview not found" });
    return;
  }

  res.json(preview);
}

export async function getChangePreview(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const deviceId = req.query.deviceId != null ? Number(req.query.deviceId) : undefined;
  const snapshotId = req.query.snapshotId != null ? Number(req.query.snapshotId) : undefined;
  const targetId = typeof req.query.targetId === "string" ? req.query.targetId : undefined;

  const previews = await listAnnouncementChangePreviews({
    deviceId: Number.isFinite(deviceId) ? deviceId : undefined,
    snapshotId: Number.isFinite(snapshotId) ? snapshotId : undefined,
    targetId,
    limit: Number(req.query.limit ?? 20),
  });

  res.json({ previews });
}

export async function postCreatePlanFromPreview(req: Request, res: Response) {
  const gate = assertPreviewEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const previewId = Number(req.params.id);
  if (!Number.isFinite(previewId)) {
    res.status(400).json({ error: "Invalid preview id" });
    return;
  }

  const user = getRequestContext()?.user;
  const body = req.body ?? {};
  const result = await createChangePlanFromPreview({
    previewId,
    createdBy: user?.id ?? null,
    createdByLabel: user?.email ?? user?.name ?? null,
    acknowledgeHighRisk: body.acknowledgeHighRisk === true,
  });

  if (result === "preview_not_found") {
    res.status(404).json({ error: "Change preview not found" });
    return;
  }
  if (result === "plan_already_exists") {
    res.status(409).json({ error: "Change plan already exists for this preview", code: "PLAN_ALREADY_EXISTS" });
    return;
  }
  if (result === "blocked") {
    res.status(422).json({ error: "Preview blocked — cannot create change plan", code: "PREVIEW_BLOCKED" });
    return;
  }
  if (result === "high_risk_ack_required") {
    res.status(422).json({
      error: "High risk preview requires manual acknowledgment",
      code: "HIGH_RISK_ACK_REQUIRED",
      message: "Estou ciente que este plano exige revisão manual.",
    });
    return;
  }

  res.status(201).json(result);
}

export async function getChangePlanForPreview(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const previewId = Number(req.params.id);
  if (!Number.isFinite(previewId)) {
    res.status(400).json({ error: "Invalid preview id" });
    return;
  }

  const link = await getChangePlanLinkForPreview(previewId);
  if (!link) {
    res.status(404).json({ error: "No change plan linked to this preview" });
    return;
  }

  res.json(link);
}

export async function listBgpAnnouncementChangePlansHandler(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const previewId = req.query.previewId != null ? Number(req.query.previewId) : undefined;
  const snapshotId = req.query.snapshotId != null ? Number(req.query.snapshotId) : undefined;
  const deviceId = req.query.deviceId != null ? Number(req.query.deviceId) : undefined;
  const targetId = typeof req.query.targetId === "string" ? req.query.targetId : undefined;

  const result = await listBgpAnnouncementChangePlans({
    previewId: Number.isFinite(previewId) ? previewId : undefined,
    snapshotId: Number.isFinite(snapshotId) ? snapshotId : undefined,
    deviceId: Number.isFinite(deviceId) ? deviceId : undefined,
    targetId,
    limit: Number(req.query.limit ?? 50),
  });

  res.json(result);
}

export async function postChangePlan(req: Request, res: Response) {
  const gate = assertPreviewEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const body = req.body ?? {};
  const deviceId = Number(body.deviceId);
  if (!Number.isFinite(deviceId) || !body.preview) {
    res.status(400).json({ error: "deviceId and preview required" });
    return;
  }

  const user = getRequestContext()?.user;
  const plan = await createChangePlanDraft({
    deviceId,
    preview: body.preview,
    upstreamCircuitId: String(body.upstreamCircuitId ?? "").padStart(2, "0").slice(-2),
    upstreamName: String(body.upstreamName ?? ""),
    targetType: String(body.targetType ?? "unknown"),
    family: body.family === "ipv6" ? "ipv6" : "ipv4",
    newState: String(body.newState ?? ""),
    createdBy: user?.id ?? null,
  });

  await logAuditEvent({
    action: "announcement_plan_created",
    objectType: "bgp_announcement_change_plan",
    objectId: String(plan.id),
    metadata: { deviceId, status: plan.status },
  });

  res.status(201).json(plan);
}

export async function getChangePlans(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const deviceId = Number(req.query.deviceId);
  if (!Number.isFinite(deviceId)) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }

  const plans = await listChangePlans(deviceId);
  res.json(plans);
}

export async function getChangePlan(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const planId = Number(req.params.id);
  if (!Number.isFinite(planId)) {
    res.status(400).json({ error: "Invalid plan id" });
    return;
  }

  const plan = await getChangePlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  res.json(plan);
}

export async function getCommunitySets(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }
  const deviceId = Number(req.query.deviceId);
  if (!Number.isFinite(deviceId)) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }
  const sets = await listCommunitySets(deviceId);
  res.json(sets);
}

export async function postSyncCommunitySets(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }
  const deviceId = Number(req.body?.deviceId ?? req.query.deviceId);
  if (!Number.isFinite(deviceId)) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }
  const count = await syncCommunitySetsFromGraph(deviceId);
  res.json({ synced: count });
}

export async function postCommunitySetResolve(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const deviceId = Number(req.body?.deviceId);
  const communities = Array.isArray(req.body?.communities) ? req.body.communities.map(String) : [];
  if (!Number.isFinite(deviceId) || communities.length === 0) {
    res.status(400).json({ error: "deviceId and communities required" });
    return;
  }

  const resolved = await resolveCommunitySetSemantics(deviceId, communities);
  res.json({ communities: resolved });
}

export async function postCommunitySetFindMatch(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const deviceId = Number(req.body?.deviceId);
  const communities = Array.isArray(req.body?.communities) ? req.body.communities.map(String) : [];
  if (!Number.isFinite(deviceId) || communities.length === 0) {
    res.status(400).json({ error: "deviceId and communities required" });
    return;
  }

  const match = await findExactCommunitySetMatch(deviceId, communities);
  res.json({ match: match ? { id: match.id, name: match.name, hash: match.normalizedHash } : null });
}

export async function getUpstreamAudit(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const deviceId = Number(req.query.deviceId);
  if (!Number.isFinite(deviceId)) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }

  const ctx = await loadAnnouncementDeviceContext(deviceId);
  if (ctx === "no_data") {
    res.status(404).json({ error: "No discovery snapshot or collected config" });
    return;
  }

  await ensureUpstreamCircuitsInDb(deviceId, ctx.parsedConfig);
  const report = runUpstreamAudit(deviceId, ctx.parsedConfig, ctx.graph, ctx.parsedConfig.bgp_peer_model?.localAs ?? null);

  const circuitIdParam = req.params.circuitId;
  if (typeof circuitIdParam === "string" && circuitIdParam.length > 0) {
    const circuitId = circuitIdParam.padStart(2, "0").slice(-2);
    const row = report.upstreams.find((u) => u.circuitId === circuitId);
    if (!row) {
      res.status(404).json({ error: "Upstream circuit not found" });
      return;
    }
    res.json(row);
    return;
  }

  res.json(report);
}

export async function getPolicyDependencies(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const deviceId = Number(req.query.deviceId);
  const policyName = String(req.params.name ?? "");
  if (!Number.isFinite(deviceId) || !policyName) {
    res.status(400).json({ error: "deviceId and policy name required" });
    return;
  }

  const ctx = await loadAnnouncementDeviceContext(deviceId);
  if (ctx === "no_data") {
    res.status(404).json({ error: "No data" });
    return;
  }

  const deps = ctx.parsedConfig.dependency_graph.route_policy_dependencies.filter(
    (d: ParsedPolicyDependencyConfig["dependency_graph"]["route_policy_dependencies"][number]) => d.routePolicy === policyName,
  );
  const bindings = ctx.parsedConfig.dependency_graph.bgp_policy_bindings.filter(
    (b: ParsedPolicyDependencyConfig["dependency_graph"]["bgp_policy_bindings"][number]) => b.routePolicy === policyName,
  );

  res.json({ policyName, dependencies: deps, bindings });
}

export async function getSnapshotDiff(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const baseSnapshotId = Number(req.query.baseSnapshotId);
  const compareSnapshotId = Number(req.query.compareSnapshotId);
  if (!Number.isFinite(baseSnapshotId) || !Number.isFinite(compareSnapshotId)) {
    res.status(400).json({ error: "baseSnapshotId and compareSnapshotId required" });
    return;
  }

  const result = await diffAnnouncementSnapshots(baseSnapshotId, compareSnapshotId);
  if (result === "base_not_found" || result === "compare_not_found") {
    res.status(404).json({ error: "Snapshot not found", code: result });
    return;
  }
  if (result === "cross_device") {
    res.status(422).json({ error: "Snapshots belong to different devices", code: "CROSS_DEVICE" });
    return;
  }
  if (result === "incompatible") {
    res.status(409).json({ error: "Snapshot format incompatible; refresh required", code: "INCOMPATIBLE" });
    return;
  }

  res.json(result);
}

export async function getSnapshotDiffLatest(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const snapshotId = Number(req.params.id);
  if (!Number.isFinite(snapshotId)) {
    res.status(400).json({ error: "Invalid snapshot id" });
    return;
  }

  const result = await diffSnapshotToLatest(snapshotId);
  if (result === "base_not_found") {
    res.status(404).json({ error: "Snapshot not found" });
    return;
  }
  if (result === "no_latest") {
    res.status(404).json({ error: "No latest snapshot for device" });
    return;
  }
  if (result === "incompatible" || result === "cross_device") {
    res.status(409).json({ error: "Snapshot incompatible", code: result });
    return;
  }

  res.json(result);
}

export async function getSnapshotTimeline(req: Request, res: Response) {
  const gate = assertMatrixEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const deviceId = Number(req.query.deviceId);
  if (!Number.isFinite(deviceId)) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }

  const limit = Number(req.query.limit ?? 20);
  const timeline = await getAnnouncementSnapshotTimeline(deviceId, Number.isFinite(limit) ? limit : 20);
  res.json(timeline);
}

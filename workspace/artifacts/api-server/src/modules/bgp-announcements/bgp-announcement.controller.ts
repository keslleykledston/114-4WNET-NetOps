import type { Request, Response } from "express";
import { assertMatrixEnabled, assertPreviewEnabled } from "./bgp-announcement.gate.js";
import {
  findExactCommunitySetMatch,
  getAnnouncementMatrix,
  getExpandedPrefixes,
  getTargetEvidence,
  listCommunitySets,
  loadAnnouncementDeviceContext,
  previewAnnouncementChange,
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
import { logAuditEvent } from "../../lib/audit.js";
import { getRequestContext } from "../../lib/request-context.js";

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

  const result = await getAnnouncementMatrix(deviceId, {
    family: typeof req.query.family === "string" ? req.query.family : undefined,
    targetType: typeof req.query.targetType === "string" ? req.query.targetType : undefined,
    search: typeof req.query.search === "string" ? req.query.search : undefined,
  });

  if (result === "device_not_found") {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  if (result === "no_snapshot") {
    res.status(404).json({ error: "No discovery snapshot or collected config available" });
    return;
  }

  res.json(result);
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

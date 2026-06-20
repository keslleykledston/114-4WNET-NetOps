import { Router, type NextFunction, type Request, type Response } from "express";
import { requirePermission } from "../../lib/auth.js";
import { getRequestContext } from "../../lib/request-context.js";
import {
  cancelSystemUpdateRun,
  createSystemUpdateRun,
  getSystemUpdateRun,
  getSystemUpdateStatusSnapshot,
  getSystemUpdateVersionSnapshot,
  listSystemUpdateChecks,
  listSystemUpdateRunSteps,
  listSystemUpdateRuns,
  performSystemUpdateCheck,
  rollbackSystemUpdateRun,
  subscribeRunEvents,
} from "./system-update.service.js";
import { env } from "../../lib/env.js";
import { parseSystemUpdateChannel, type SystemUpdateChannel } from "./system-update.utils.js";

const router = Router();

function requireSystemUpdateEnabled(_req: Request, res: Response, next: NextFunction) {
  if (!env.systemUpdateEnabled) {
    res.status(503).json({ error: "System update module disabled" });
    return;
  }
  next();
}

router.use(requireSystemUpdateEnabled);

router.get("/system/version", requirePermission("systemUpdate.read"), async (_req, res) => {
  const snapshot = await getSystemUpdateVersionSnapshot();
  res.json(snapshot);
});

router.get("/system/update/status", requirePermission("systemUpdate.read"), async (_req, res) => {
  const snapshot = await getSystemUpdateStatusSnapshot();
  res.json(snapshot);
});

router.post("/system/update/check", requirePermission("systemUpdate.verify"), async (req, res) => {
  const context = getRequestContext();
  const channel = parseSystemUpdateChannel(req.body?.channel, env.systemUpdateChannel as SystemUpdateChannel);
  const result = await performSystemUpdateCheck(context?.user?.email ?? null, channel);
  res.json(result);
});

router.get("/system/update/checks", requirePermission("systemUpdate.history"), async (_req, res) => {
  const checks = await listSystemUpdateChecks();
  res.json(checks);
});

router.post("/system/update/run", requirePermission("systemUpdate.execute"), async (req, res) => {
  const context = getRequestContext();
  const channel = parseSystemUpdateChannel(req.body?.channel, env.systemUpdateChannel as SystemUpdateChannel);
  const result = await createSystemUpdateRun(context?.user?.email ?? null, channel);
  res.status(result.started ? 202 : 200).json(result);
});

router.get("/system/update/runs", requirePermission("systemUpdate.history"), async (_req, res) => {
  const runs = await listSystemUpdateRuns();
  res.json(runs);
});

router.get("/system/update/runs/:id", requirePermission("systemUpdate.history"), async (req, res) => {
  const run = await getSystemUpdateRun(Number(req.params.id));
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(run);
});

router.get("/system/update/runs/:id/steps", requirePermission("systemUpdate.history"), async (req, res) => {
  const steps = await listSystemUpdateRunSteps(Number(req.params.id));
  res.json(steps);
});

router.post("/system/update/runs/:id/cancel", requirePermission("systemUpdate.execute"), async (req, res) => {
  const context = getRequestContext();
  const run = await cancelSystemUpdateRun(Number(req.params.id), context?.user?.email ?? null);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(run);
});

router.post("/system/update/runs/:id/rollback", requirePermission("systemUpdate.rollback"), async (req, res) => {
  const context = getRequestContext();
  const run = await rollbackSystemUpdateRun(Number(req.params.id), context?.user?.email ?? null);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(run);
});

router.get("/system/update/events/:runId", requirePermission("systemUpdate.history"), async (req, res) => {
  const runId = Number(req.params.runId);
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`event: open\ndata: ${JSON.stringify({ runId, connected: true })}\n\n`);
  subscribeRunEvents(runId, res);
});

export default router;

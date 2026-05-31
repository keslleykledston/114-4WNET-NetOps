import { Router } from "express";
import { requireRole } from "../../lib/auth.js";
import {
  dispatchAlertNotifications,
  getTenantNotificationSettings,
  listAlertNotifications,
  listTenantNotificationSettings,
  upsertTenantNotificationSettings,
} from "./notifications.service.js";
import type { ConnectorAlertType } from "../connectors/connector-health.types.js";

const router = Router();

function sendError(res: import("express").Response, error: unknown, fallback: string) {
  res.status(400).json({ error: error instanceof Error ? error.message : fallback });
}

router.get("/tenant-notifications", async (_req, res) => {
  res.json(await listTenantNotificationSettings());
});

router.get("/tenants/:tenantId/notifications", async (req, res) => {
  const tenantId = Number(req.params.tenantId);
  if (!Number.isInteger(tenantId) || tenantId < 1) {
    res.status(400).json({ error: "Invalid tenant id" });
    return;
  }
  const settings = await getTenantNotificationSettings(tenantId);
  if (!settings) {
    res.status(404).json({ error: "Notification settings not found" });
    return;
  }
  res.json(settings);
});

router.put("/tenants/:tenantId/notifications", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const tenantId = Number(req.params.tenantId);
    if (!Number.isInteger(tenantId) || tenantId < 1) {
      res.status(400).json({ error: "Invalid tenant id" });
      return;
    }
    const settings = await upsertTenantNotificationSettings(tenantId, req.body ?? {});
    res.json(settings);
  } catch (error) {
    sendError(res, error, "Failed to update tenant notifications");
  }
});

router.get("/alert-notifications", async (req, res) => {
  const tenantId = Number(req.query.tenant_id);
  const limit = Number(req.query.limit);
  res.json(
    await listAlertNotifications({
      tenantId: Number.isInteger(tenantId) && tenantId > 0 ? tenantId : undefined,
      limit: Number.isInteger(limit) && limit > 0 ? limit : undefined,
    }),
  );
});

router.post("/alerts/:alertType/dispatch", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const tenantId = Number(req.body?.tenant_id);
    const connectorId = Number(req.body?.connector_id);
    const deviceId = Number(req.body?.device_id);
    if (!Number.isInteger(tenantId) || tenantId < 1) {
      res.status(400).json({ error: "tenant_id is required" });
      return;
    }
    res.json(
      await dispatchAlertNotifications({
        tenantId,
        connectorId: Number.isInteger(connectorId) && connectorId > 0 ? connectorId : null,
        deviceId: Number.isInteger(deviceId) && deviceId > 0 ? deviceId : null,
        alertType: req.params.alertType as ConnectorAlertType,
        severity: typeof req.body?.severity === "string" ? req.body.severity : "WARNING",
        title: typeof req.body?.title === "string" ? req.body.title : "Manual alert",
        message: typeof req.body?.message === "string" ? req.body.message : "Manual dispatch",
        payload: req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {},
      }),
    );
  } catch (error) {
    sendError(res, error, "Failed to dispatch alert notifications");
  }
});

export default router;

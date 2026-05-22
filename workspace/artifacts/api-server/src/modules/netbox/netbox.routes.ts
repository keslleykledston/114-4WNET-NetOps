import { Router, type Request, type Response } from "express";
import { requireRole } from "../../lib/auth.js";
import { NetBoxError } from "./netbox.client.js";
import {
  getDeviceRoles,
  getDevices,
  getManufacturers,
  getPlatforms,
  getSites,
  getStatus,
  getTenants,
  postPreviewSync,
  postSyncLocal,
  postTestConnection,
} from "./netbox.controller.js";

const router = Router();

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    handler(req, res).catch((error) => {
      if (error instanceof NetBoxError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "NetBox request failed" });
    });
  };
}

router.get("/netbox/status", asyncRoute(getStatus));
router.post("/netbox/test-connection", requireRole(["operator", "admin"]), asyncRoute(postTestConnection));
router.get("/netbox/devices", requireRole(["operator", "admin"]), asyncRoute(getDevices));
router.get("/netbox/sites", requireRole(["operator", "admin"]), asyncRoute(getSites));
router.get("/netbox/tenants", requireRole(["operator", "admin"]), asyncRoute(getTenants));
router.get("/netbox/device-roles", requireRole(["operator", "admin"]), asyncRoute(getDeviceRoles));
router.get("/netbox/manufacturers", requireRole(["operator", "admin"]), asyncRoute(getManufacturers));
router.get("/netbox/platforms", requireRole(["operator", "admin"]), asyncRoute(getPlatforms));
router.post("/netbox/devices/preview-sync", requireRole(["operator", "admin"]), asyncRoute(postPreviewSync));
router.post("/netbox/devices/sync-local", requireRole(["admin"]), asyncRoute(postSyncLocal));

export default router;

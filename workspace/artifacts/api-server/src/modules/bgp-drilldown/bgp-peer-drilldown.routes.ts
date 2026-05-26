import { Router } from "express";
import { requirePermission } from "../../lib/auth.js";
import { getBgpPeerDrilldownHandler } from "./bgp-peer-drilldown.controller.js";

const router = Router();

router.get(
  "/bgp/peers/:deviceId/:peer/drilldown",
  requirePermission("devices.read"),
  getBgpPeerDrilldownHandler,
);

export default router;

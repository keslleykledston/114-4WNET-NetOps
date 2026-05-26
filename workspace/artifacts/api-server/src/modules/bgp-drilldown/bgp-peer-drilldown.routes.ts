import { Router } from "express";
import { requirePermission } from "../../lib/auth.js";
import { getBgpPeerDrilldownHandler, postBgpPeerDrilldownDetailHandler } from "./bgp-peer-drilldown.controller.js";

const router = Router();

router.get(
  "/bgp/peers/:deviceId/:peer/drilldown",
  requirePermission("devices.read"),
  getBgpPeerDrilldownHandler,
);

router.post(
  "/bgp/peers/:deviceId/:peer/drilldown/detail",
  requirePermission("devices.read"),
  postBgpPeerDrilldownDetailHandler,
);

export default router;

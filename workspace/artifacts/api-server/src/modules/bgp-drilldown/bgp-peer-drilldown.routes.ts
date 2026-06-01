import { Router } from "express";
import { requirePermission } from "../../lib/auth.js";
import {
  getBgpPeerDrilldownHandler,
  getBgpPeerDrilldownHistoryCompareHandler,
  getBgpPeerDrilldownHistoryHandler,
  postBgpPolicyEditorPreviewHandler,
  postBgpPeerDrilldownDetailHandler,
} from "./bgp-peer-drilldown.controller.js";

const router = Router();

router.get(
  "/bgp/peers/:deviceId/:peer/drilldown",
  requirePermission("devices.read"),
  getBgpPeerDrilldownHandler,
);

router.get(
  "/bgp/peers/:deviceId/:peer/drilldown/history/compare",
  requirePermission("devices.read"),
  getBgpPeerDrilldownHistoryCompareHandler,
);

router.get(
  "/bgp/peers/:deviceId/:peer/drilldown/history",
  requirePermission("devices.read"),
  getBgpPeerDrilldownHistoryHandler,
);

router.post(
  "/bgp/peers/:deviceId/:peer/drilldown/detail",
  requirePermission("devices.read"),
  postBgpPeerDrilldownDetailHandler,
);

router.post(
  "/bgp/peers/:deviceId/:peer/policy-editor/preview",
  requirePermission("devices.read"),
  postBgpPolicyEditorPreviewHandler,
);

export default router;

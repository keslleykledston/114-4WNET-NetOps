import { Router } from "express";
import { requirePermission } from "../../lib/auth.js";
import {
  getBgpPeerCleanupAnalysisHandler,
  postBgpPeerCleanupAnalyzeHandler,
  postBgpPeerCleanupExportHandler,
} from "./bgp-drill-cleanup.controller.js";

const router = Router();

router.post(
  "/devices/:id/bgp/peers/:peerIp/cleanup/analyze",
  requirePermission("bgp.read"),
  postBgpPeerCleanupAnalyzeHandler,
);

router.get(
  "/bgp-cleanup-analyses/:id",
  requirePermission("bgp.read"),
  getBgpPeerCleanupAnalysisHandler,
);

router.post(
  "/bgp-cleanup-analyses/:id/export",
  requirePermission("bgp.cleanup.plan"),
  postBgpPeerCleanupExportHandler,
);

export default router;

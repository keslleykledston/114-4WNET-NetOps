import { Router } from "express";
import { requirePermission } from "../../lib/auth.js";
import {
  getOperationalBgpHandler,
  getOperationalBgpSummaryHandler,
  postOperationalBgpCollectHandler,
} from "./operational-bgp.controller.js";

const router = Router();

router.get("/operational/bgp", requirePermission("devices.read"), getOperationalBgpHandler);
router.get("/operational/bgp/summary", requirePermission("devices.read"), getOperationalBgpSummaryHandler);
router.post("/operational/bgp/collect", requirePermission("devices.read"), postOperationalBgpCollectHandler);

export default router;

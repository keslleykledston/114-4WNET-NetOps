import { Router } from "express";
import {
  getVsiVplsAlarmsHandler,
  getVsiVplsConfigsHandler,
  getVsiVplsDetailHandler,
  getVsiVplsHistoryHandler,
  getVsiVplsMembersHandler,
  listVsiVplsHandler,
  runVsiVplsDiscoveryHandler,
} from "./vsi-vpls.controller.js";

const router = Router();

router.get("/l2/vsi-vpls", listVsiVplsHandler);
router.get("/l2/vsi-vpls/:id", getVsiVplsDetailHandler);
router.get("/l2/vsi-vpls/:id/members", getVsiVplsMembersHandler);
router.get("/l2/vsi-vpls/:id/configs", getVsiVplsConfigsHandler);
router.get("/l2/vsi-vpls/:id/alarms", getVsiVplsAlarmsHandler);
router.get("/l2/vsi-vpls/:id/history", getVsiVplsHistoryHandler);
router.post("/l2/vsi-vpls/discovery/run", runVsiVplsDiscoveryHandler);

export default router;

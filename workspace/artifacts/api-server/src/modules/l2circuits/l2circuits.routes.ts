import { Router } from "express";
import {
  discoverL2CircuitsHandler,
  getL2DiscoveryJobHandler,
  listL2CircuitsHandler,
  getL2CircuitHandler,
  refreshL2CircuitsHandler,
} from "./l2circuits.controller.js";

const router = Router();

router.post("/l2-circuits/discover", discoverL2CircuitsHandler);
router.post("/l2-circuits/refresh", refreshL2CircuitsHandler);
router.get("/l2-circuits/discovery-jobs/:runId", getL2DiscoveryJobHandler);
router.get("/l2-circuits", listL2CircuitsHandler);
router.get("/l2-circuits/:id", getL2CircuitHandler);

export default router;

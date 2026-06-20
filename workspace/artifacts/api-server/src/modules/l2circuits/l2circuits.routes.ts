import { Router } from "express";
import {
  discoverL2CircuitsHandler,
  getL2DiscoveryJobHandler,
  listL2CircuitsHandler,
  getL2CircuitHandler,
  refreshL2CircuitsHandler,
} from "./l2circuits.controller.js";
import vsiVplsRouter from "./vsi-vpls/vsi-vpls.routes.js";

const router = Router();

router.post("/l2-circuits/discover", discoverL2CircuitsHandler);
router.post("/l2-circuits/refresh", refreshL2CircuitsHandler);
router.get("/l2-circuits/discovery-jobs/:runId", getL2DiscoveryJobHandler);
router.get("/l2-circuits", listL2CircuitsHandler);
router.get("/l2-circuits/:id", getL2CircuitHandler);
router.use(vsiVplsRouter);

export default router;

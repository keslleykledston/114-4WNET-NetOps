import { Router } from "express";
import { discoverL2CircuitsHandler, getL2DiscoveryJobHandler, listL2CircuitsHandler, getL2CircuitHandler } from "./l2circuits.controller.js";

const router = Router();

// POST /api/l2-circuits/discover - start discovery job
router.post("/api/l2-circuits/discover", discoverL2CircuitsHandler);

// GET /api/l2-circuits/discovery-jobs/:runId - get job status
router.get("/api/l2-circuits/discovery-jobs/:runId", getL2DiscoveryJobHandler);

// GET /api/l2-circuits - list circuits with filters
router.get("/api/l2-circuits", listL2CircuitsHandler);

// GET /api/l2-circuits/:id - get single circuit
router.get("/api/l2-circuits/:id", getL2CircuitHandler);

export default router;

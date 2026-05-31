import { Router } from "express";
import { requirePermission } from "../lib/auth.js";
import { getRequestSourceIp, logAuditEvent } from "../lib/audit.js";
import {
  allocate,
  findNextAvailable,
  reserve,
  release,
  validateAvailability,
  getPoolUsage,
  createPool,
  listPools,
  getAllocations,
  searchAllocations,
  getActiveReservations,
  cleanupExpiredReservations,
} from "../modules/resource-manager/resource-manager.service.js";
import {
  detectResourceCollisions,
  checkVlanConflict,
  checkVCIdConflict,
  checkRDConflict,
  checkRTConflict,
  generateCollisionReport,
} from "../modules/resource-manager/resource-collision.service.js";

const router = Router();

// GET /api/resources/pools — List all resource pools
router.get("/resources/pools", requirePermission("resources.read"), async (req, res) => {
  try {
    const resourceType = req.query.resourceType as string | undefined;
    const pools = await listPools(resourceType);
    res.json(pools);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// POST /api/resources/pools — Create resource pool
router.post("/resources/pools", requirePermission("resources.admin"), async (req, res) => {
  try {
    const { name, resourceType, rangeStart, rangeEnd, vendor, tenantId, siteId, metadata } = req.body;
    if (!name || !resourceType || rangeStart === undefined || rangeEnd === undefined) {
      res.status(400).json({ error: "name, resourceType, rangeStart, rangeEnd required" });
      return;
    }

    const pool = await createPool(name, resourceType, rangeStart, rangeEnd, vendor, tenantId, siteId, metadata);

    await logAuditEvent({
      action: "resource_pool_created",
      objectType: "resource_pool",
      objectId: String(pool.id),
      metadata: { name, resourceType, range: `${rangeStart}-${rangeEnd}` },
      sourceIp: getRequestSourceIp(req),
    });

    res.status(201).json(pool);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// POST /api/resources/allocate — Allocate resource
router.post("/resources/allocate", requirePermission("resources.write"), async (req, res) => {
  try {
    const { poolId, resourceValue, deviceId, serviceRequestId } = req.body;
    if (!poolId) {
      res.status(400).json({ error: "poolId required" });
      return;
    }

    const alloc = await allocate(poolId, resourceValue, deviceId, serviceRequestId, "system");

    await logAuditEvent({
      action: "resource_allocated",
      objectType: "resource_allocation",
      objectId: String(alloc.id),
      metadata: { poolId, value: alloc.value, deviceId, serviceRequestId },
      sourceIp: getRequestSourceIp(req),
    });

    res.status(201).json(alloc);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Allocation failed" });
  }
});

// GET /api/resources/next/:poolId — Get next available resource
router.get("/resources/next/:poolId", requirePermission("resources.read"), async (req, res) => {
  try {
    const poolId = Number(req.params.poolId);
    const next = await findNextAvailable(poolId);
    res.json({ poolId, next, available: next !== null });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// POST /api/resources/reserve — Reserve resource
router.post("/resources/reserve", requirePermission("resources.write"), async (req, res) => {
  try {
    const { poolId, resourceValue, expiresAt } = req.body;
    if (!poolId || !resourceValue || !expiresAt) {
      res.status(400).json({ error: "poolId, resourceValue, expiresAt required" });
      return;
    }

    const reservation = await reserve(
      poolId,
      resourceValue,
      new Date(expiresAt),
      "system"
    );

    await logAuditEvent({
      action: "resource_reserved",
      objectType: "resource_reservation",
      objectId: String(reservation.id),
      metadata: { poolId, resourceValue, expiresAt },
      sourceIp: getRequestSourceIp(req),
    });

    res.status(201).json(reservation);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Reservation failed" });
  }
});

// POST /api/resources/release/:allocationId — Release resource
router.post("/resources/release/:allocationId", requirePermission("resources.write"), async (req, res) => {
  try {
    const allocationId = Number(req.params.allocationId);
    await release(allocationId, "system");

    await logAuditEvent({
      action: "resource_released",
      objectType: "resource_allocation",
      objectId: String(allocationId),
      metadata: {},
      sourceIp: getRequestSourceIp(req),
    });

    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /api/resources/allocations — List allocations
router.get("/resources/allocations", requirePermission("resources.read"), async (req, res) => {
  try {
    const poolId = req.query.poolId ? Number(req.query.poolId) : undefined;
    const status = req.query.status as string | undefined;
    const allocations = await getAllocations(poolId, status);
    res.json(allocations);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /api/resources/search — Search allocations
router.get("/resources/search", requirePermission("resources.read"), async (req, res) => {
  try {
    const term = req.query.q as string;
    if (!term) {
      res.status(400).json({ error: "Search term required" });
      return;
    }
    const results = await searchAllocations(term);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /api/resources/usage/:poolId — Get pool usage
router.get("/resources/usage/:poolId", requirePermission("resources.read"), async (req, res) => {
  try {
    const poolId = Number(req.params.poolId);
    const usage = await getPoolUsage(poolId);
    res.json(usage);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /api/resources/collisions — Detect resource collisions
router.get("/resources/collisions", requirePermission("resources.read"), async (req, res) => {
  try {
    const collisions = await detectResourceCollisions();
    res.json(collisions);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// POST /api/resources/collisions/check — Check specific collision
router.post("/resources/collisions/check", requirePermission("resources.read"), async (req, res) => {
  try {
    const { type, value } = req.body;
    let conflict = false;

    if (type === "VLAN" && typeof value === "number") {
      conflict = await checkVlanConflict(value);
    } else if (type === "VC_ID" && typeof value === "number") {
      conflict = await checkVCIdConflict(value);
    } else if (type === "RD" && typeof value === "string") {
      conflict = await checkRDConflict(value);
    } else if (type === "RT" && typeof value === "string") {
      conflict = await checkRTConflict(value);
    }

    res.json({ type, value, conflict });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /api/resources/report — Generate collision report
router.get("/resources/report", requirePermission("resources.read"), async (req, res) => {
  try {
    const report = await generateCollisionReport();
    res.json({ timestamp: new Date().toISOString(), collisions: report });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// POST /api/resources/cleanup — Cleanup expired reservations
router.post("/resources/cleanup", requirePermission("resources.admin"), async (req, res) => {
  try {
    const count = await cleanupExpiredReservations();
    res.json({ cleaned: count });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

export default router;

import { Router, Request, Response } from "express";
import { requirePermission } from "../../lib/auth.js";
import { listServiceCatalog, getServiceCatalogItem, seedServiceCatalog } from "./service-catalog.service";

const router = Router();

let seeded = false;
router.use(async (_r, _res, next) => {
  if (!seeded) {
    seeded = true;
    await seedServiceCatalog().catch(console.error);
  }
  next();
});

router.get("/service-catalog", requirePermission("provisioning.read"), async (_req: Request, res: Response) => {
  try {
    const items = await listServiceCatalog();
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
});

router.get("/service-catalog/:id", requirePermission("provisioning.read"), async (req: Request, res: Response) => {
  try {
    const item = await getServiceCatalogItem(Number(req.params.id));
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
});

export const serviceCatalogRouter = router;

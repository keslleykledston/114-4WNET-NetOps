import { Router } from "express";
import { requirePermission } from "../../lib/auth.js";
import {
  deleteBgpAuthorizedPrefixesHandler,
  deleteBgpCustomerConnectionsHandler,
  deleteBgpCustomersHandler,
  deleteBgpExitCommunityActionsHandler,
  deleteBgpExitPointsHandler,
  getBgpAuthorizedPrefixesHandler,
  getBgpCustomerAnnouncementStateHandler,
  getBgpCustomerReconcileHandler,
  getBgpCustomerConnectionsHandler,
  getBgpCustomersHandler,
  getBgpExitCommunityActionsHandler,
  getBgpExitPointsHandler,
  getBgpRegistryAuditLogHandler,
  patchBgpAuthorizedPrefixesHandler,
  patchBgpCustomerConnectionsHandler,
  patchBgpCustomersHandler,
  patchBgpExitCommunityActionsHandler,
  patchBgpExitPointsHandler,
  postBgpAuthorizedPrefixesHandler,
  postBgpCustomerConnectionsHandler,
  postBgpCustomersHandler,
  postBgpExitCommunityActionsHandler,
  postBgpExitPointsHandler,
  postBgpCustomerPreviewHandler,
} from "./bgp-registry.controller.js";

const router = Router();

router.get("/api/bgp/registry/customers", requirePermission("bgp_announcements.view"), getBgpCustomersHandler);
router.post("/api/bgp/registry/customers", requirePermission("bgp_announcements.change_plan.create"), postBgpCustomersHandler);
router.patch("/api/bgp/registry/customers/:id", requirePermission("bgp_announcements.change_plan.create"), patchBgpCustomersHandler);
router.delete("/api/bgp/registry/customers/:id", requirePermission("bgp_announcements.change_plan.create"), deleteBgpCustomersHandler);
router.get("/api/bgp/registry/customers/:id/announcement-state", requirePermission("bgp_announcements.view"), getBgpCustomerAnnouncementStateHandler);
router.get("/api/bgp/registry/customers/:id/reconcile", requirePermission("bgp_announcements.view"), getBgpCustomerReconcileHandler);
router.post("/api/bgp/registry/customers/:id/preview", requirePermission("bgp_announcements.preview"), postBgpCustomerPreviewHandler);

router.get("/api/bgp/registry/connections", requirePermission("bgp_announcements.view"), getBgpCustomerConnectionsHandler);
router.post("/api/bgp/registry/connections", requirePermission("bgp_announcements.change_plan.create"), postBgpCustomerConnectionsHandler);
router.patch("/api/bgp/registry/connections/:id", requirePermission("bgp_announcements.change_plan.create"), patchBgpCustomerConnectionsHandler);
router.delete("/api/bgp/registry/connections/:id", requirePermission("bgp_announcements.change_plan.create"), deleteBgpCustomerConnectionsHandler);

router.get("/api/bgp/registry/prefixes", requirePermission("bgp_announcements.view"), getBgpAuthorizedPrefixesHandler);
router.post("/api/bgp/registry/prefixes", requirePermission("bgp_announcements.change_plan.create"), postBgpAuthorizedPrefixesHandler);
router.patch("/api/bgp/registry/prefixes/:id", requirePermission("bgp_announcements.change_plan.create"), patchBgpAuthorizedPrefixesHandler);
router.delete("/api/bgp/registry/prefixes/:id", requirePermission("bgp_announcements.change_plan.create"), deleteBgpAuthorizedPrefixesHandler);

router.get("/api/bgp/registry/exit-points", requirePermission("bgp_announcements.view"), getBgpExitPointsHandler);
router.post("/api/bgp/registry/exit-points", requirePermission("bgp_announcements.change_plan.create"), postBgpExitPointsHandler);
router.patch("/api/bgp/registry/exit-points/:id", requirePermission("bgp_announcements.change_plan.create"), patchBgpExitPointsHandler);
router.delete("/api/bgp/registry/exit-points/:id", requirePermission("bgp_announcements.change_plan.create"), deleteBgpExitPointsHandler);

router.get("/api/bgp/registry/community-actions", requirePermission("bgp_announcements.view"), getBgpExitCommunityActionsHandler);
router.post("/api/bgp/registry/community-actions", requirePermission("bgp_announcements.change_plan.create"), postBgpExitCommunityActionsHandler);
router.patch("/api/bgp/registry/community-actions/:id", requirePermission("bgp_announcements.change_plan.create"), patchBgpExitCommunityActionsHandler);
router.delete("/api/bgp/registry/community-actions/:id", requirePermission("bgp_announcements.change_plan.create"), deleteBgpExitCommunityActionsHandler);

router.get("/api/bgp/registry/audit-log", requirePermission("bgp_announcements.view"), getBgpRegistryAuditLogHandler);

export const bgpRegistryRouter = router;

import { Router } from "express";
import { requirePermission } from "../../lib/auth.js";
import {
  archiveReviewHandler,
  approveManualHandler,
  closeChangePlanHandler,
  exportChangePlanHandler,
  getChangePlanDiffHandler,
  getChangePlanHandler,
  listChangePlansHandler,
  listDeviceChangePlansHandler,
  rejectReviewHandler,
  requestChangesHandler,
  submitReviewHandler,
} from "./change-plans.controller.js";

const router = Router();

router.get(
  "/change-plans",
  requirePermission("bgp.announcements.read"),
  listChangePlansHandler,
);

router.get(
  "/change-plans/device/:id",
  requirePermission("bgp.announcements.read"),
  listDeviceChangePlansHandler,
);

router.get(
  "/change-plans/:id",
  requirePermission("bgp.announcements.read"),
  getChangePlanHandler,
);

router.get(
  "/change-plans/:id/diff",
  requirePermission("bgp.announcements.read"),
  getChangePlanDiffHandler,
);

router.post(
  "/change-plans/:id/export",
  requirePermission("bgp.cleanup.plan"),
  exportChangePlanHandler,
);

router.post(
  "/change-plans/:id/close",
  requirePermission("bgp.cleanup.plan"),
  closeChangePlanHandler,
);

router.post(
  "/change-plans/:id/submit-review",
  requirePermission("bgp.announcements.plan"),
  submitReviewHandler,
);

router.post(
  "/change-plans/:id/request-changes",
  requirePermission("bgp.announcements.approve"),
  requestChangesHandler,
);

router.post(
  "/change-plans/:id/reject",
  requirePermission("bgp.announcements.approve"),
  rejectReviewHandler,
);

router.post(
  "/change-plans/:id/approve-manual",
  requirePermission("bgp.announcements.approve"),
  approveManualHandler,
);

router.post(
  "/change-plans/:id/archive",
  requirePermission("bgp.announcements.plan"),
  archiveReviewHandler,
);

export default router;

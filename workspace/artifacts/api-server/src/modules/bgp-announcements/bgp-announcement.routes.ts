import { Router } from "express";
import { requirePermission } from "../../lib/auth.js";
import {
  getChangePlan,
  getChangePlans,
  getCommunitySets,
  getEvidence,
  getExpandedPrefixesHandler,
  getMatrix,
  getPolicyDependencies,
  getUpstreamAudit,
  postChangePlan,
  postCommunitySetFindMatch,
  postCommunitySetResolve,
  postPreviewChange,
  postSyncCommunitySets,
} from "./bgp-announcement.controller.js";

const router = Router();

router.get("/bgp/announcements/matrix", requirePermission("bgp.announcements.read"), getMatrix);
router.get("/bgp/announcements/evidence", requirePermission("bgp.announcements.read"), getEvidence);
router.get("/bgp/announcements/expanded-prefixes", requirePermission("bgp.announcements.read"), getExpandedPrefixesHandler);
router.post("/bgp/announcements/preview-change", requirePermission("bgp.announcements.preview"), postPreviewChange);
router.get("/bgp/announcements/change-plans", requirePermission("bgp.announcements.read"), getChangePlans);
router.post("/bgp/announcements/change-plans", requirePermission("bgp.announcements.plan"), postChangePlan);
router.get("/bgp/announcements/change-plans/:id", requirePermission("bgp.announcements.read"), getChangePlan);

router.get("/bgp/community-sets", requirePermission("bgp.announcements.read"), getCommunitySets);
router.post("/bgp/community-sets/sync", requirePermission("bgp.announcements.read"), postSyncCommunitySets);
router.post("/bgp/community-sets/resolve", requirePermission("bgp.announcements.read"), postCommunitySetResolve);
router.post("/bgp/community-sets/find-exact-match", requirePermission("bgp.announcements.read"), postCommunitySetFindMatch);

router.get("/bgp/upstreams/audit", requirePermission("bgp.announcements.read"), getUpstreamAudit);
router.get("/bgp/upstreams/:circuitId/audit", requirePermission("bgp.announcements.read"), getUpstreamAudit);
router.get("/bgp/policies/:name/dependencies", requirePermission("bgp.announcements.read"), getPolicyDependencies);

export default router;

import { Router } from "express";
import {
  getCommunitiesLibrary,
  getCommunitySets,
  getCommunitySetDetails,
  postCreateCommunitySet,
  putUpdateCommunitySet,
  deleteCommunityset,
  postPreviewCommunitySet,
  postApplyCommunitySet,
  getCommunityChangeAudit,
} from "./community.controller.js";

const router = Router();

// Library (community-filters)
router.get("/devices/:id/communities/library", getCommunitiesLibrary);

// Sets (community-lists)
router.get("/devices/:id/community-sets", getCommunitySets);
router.get("/devices/:id/community-sets/:setId", getCommunitySetDetails);
router.post("/devices/:id/community-sets", postCreateCommunitySet);
router.put("/devices/:id/community-sets/:setId", putUpdateCommunitySet);
router.delete("/devices/:id/community-sets/:setId", deleteCommunityset);

// Apply workflow
router.post("/devices/:id/community-sets/:setId/preview", postPreviewCommunitySet);
router.post("/devices/:id/community-sets/:setId/apply", postApplyCommunitySet);

// Audit
router.get("/devices/:id/community-change-audit", getCommunityChangeAudit);

export default router;

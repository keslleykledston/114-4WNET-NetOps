import { Router } from "express";
import {
  discoverDevice,
  getDiscoveryBgpPeers,
  getDiscoveryPeerDetails,
  getDiscoverySnapshot,
  getDiscoveryStatus,
  postDiscoveryRouteQuery,
} from "./discovery.controller.js";
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

// Discovery
router.post("/devices/:id/discover", discoverDevice);
router.get("/devices/:id/discovery-status", getDiscoveryStatus);
router.get("/devices/:id/discovery-snapshot", getDiscoverySnapshot);

// BGP
router.get("/devices/:id/bgp/peers", getDiscoveryBgpPeers);
router.get("/devices/:id/bgp/peers/:peerIp/details", getDiscoveryPeerDetails);
router.post("/devices/:id/bgp/peers/:peerIp/routes/query", postDiscoveryRouteQuery);

// Communities
router.get("/devices/:id/communities/library", getCommunitiesLibrary);
router.get("/devices/:id/community-sets", getCommunitySets);
router.get("/devices/:id/community-sets/:setId", getCommunitySetDetails);
router.post("/devices/:id/community-sets", postCreateCommunitySet);
router.put("/devices/:id/community-sets/:setId", putUpdateCommunitySet);
router.delete("/devices/:id/community-sets/:setId", deleteCommunityset);
router.post("/devices/:id/community-sets/:setId/preview", postPreviewCommunitySet);
router.post("/devices/:id/community-sets/:setId/apply", postApplyCommunitySet);
router.get("/devices/:id/community-change-audit", getCommunityChangeAudit);

export default router;

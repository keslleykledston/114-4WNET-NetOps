import { Router } from "express";
import {
  discoverDevice,
  getDiscoveryBgpPeers,
  getDiscoveryPeerDetails,
  getDiscoverySnapshot,
  postDiscoveryRouteQuery,
} from "./discovery.controller.js";

const router = Router();

router.post("/devices/:id/discover", discoverDevice);
router.get("/devices/:id/discovery-snapshot", getDiscoverySnapshot);
router.get("/devices/:id/bgp/peers", getDiscoveryBgpPeers);
router.get("/devices/:id/bgp/peers/:peerIp/details", getDiscoveryPeerDetails);
router.post("/devices/:id/bgp/peers/:peerIp/routes/query", postDiscoveryRouteQuery);

export default router;

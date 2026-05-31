import { Router } from "express";
import {
  getConfigById,
  getConfigDiff,
  listDeviceConfigHistory,
} from "./config-history.service.js";

const router = Router();

router.get("/devices/:id/config-history", async (req, res) => {
  const deviceId = Number(req.params.id);
  if (!Number.isInteger(deviceId) || deviceId < 1) {
    res.status(400).json({ error: "Invalid device id" });
    return;
  }
  res.json(await listDeviceConfigHistory(deviceId));
});

router.get("/configs/:id", async (req, res) => {
  const configId = Number(req.params.id);
  if (!Number.isInteger(configId) || configId < 1) {
    res.status(400).json({ error: "Invalid config id" });
    return;
  }
  const config = await getConfigById(configId);
  if (!config) {
    res.status(404).json({ error: "Config not found" });
    return;
  }
  res.json(config);
});

router.get("/configs/:id/diff", async (req, res) => {
  const configId = Number(req.params.id);
  if (!Number.isInteger(configId) || configId < 1) {
    res.status(400).json({ error: "Invalid config id" });
    return;
  }
  const diff = await getConfigDiff(configId);
  if (!diff) {
    res.status(404).json({ error: "Config diff not found" });
    return;
  }
  res.json(diff);
});

export default router;

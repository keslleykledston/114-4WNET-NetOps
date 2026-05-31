import { Router } from "express";
import { requireRole } from "../../lib/auth.js";
import {
  assignCredentialToDevice,
  createCredentialProfile,
  deleteCredentialProfile,
  getCredentialProfile,
  listCredentialAssignments,
  listCredentialProfiles,
  removeCredentialAssignment,
  rotateCredentialProfile,
  testCredentialProfile,
  updateCredentialProfile,
} from "./credential-vault.service.js";

const router = Router();

function sendError(res: import("express").Response, error: unknown, fallback: string) {
  res.status(400).json({ error: error instanceof Error ? error.message : fallback });
}

router.get("/credential-profiles", async (_req, res) => {
  res.json(await listCredentialProfiles());
});

router.get("/credential-profiles/:id", async (req, res) => {
  const profile = await getCredentialProfile(req.params.id);
  if (!profile) {
    res.status(404).json({ error: "Credential not found" });
    return;
  }
  res.json(profile);
});

router.post("/credential-profiles", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    res.status(201).json(await createCredentialProfile(req.body ?? {}));
  } catch (error) {
    sendError(res, error, "Failed to create credential");
  }
});

router.put("/credential-profiles/:id", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const updated = await updateCredentialProfile(String(req.params.id), req.body ?? {});
    if (!updated) {
      res.status(404).json({ error: "Credential not found" });
      return;
    }
    res.json(updated);
  } catch (error) {
    sendError(res, error, "Failed to update credential");
  }
});

router.post("/credential-profiles/:id/rotate", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const updated = await rotateCredentialProfile(String(req.params.id), req.body ?? {});
    if (!updated) {
      res.status(404).json({ error: "Credential not found" });
      return;
    }
    res.json(updated);
  } catch (error) {
    sendError(res, error, "Failed to rotate credential");
  }
});

router.post("/credential-profiles/:id/test", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    res.json(await testCredentialProfile(String(req.params.id), req.body ?? {}));
  } catch (error) {
    sendError(res, error, "Failed to test credential");
  }
});

router.delete("/credential-profiles/:id", requireRole(["admin"]), async (req, res) => {
  const deleted = await deleteCredentialProfile(String(req.params.id));
  if (!deleted) {
    res.status(404).json({ error: "Credential not found" });
    return;
  }
  res.status(204).end();
});

router.get("/credential-assignments", async (req, res) => {
  const deviceId = Number(req.query.device_id);
  res.json(await listCredentialAssignments(Number.isInteger(deviceId) && deviceId > 0 ? deviceId : undefined));
});

router.post("/credential-assignments", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    res.status(201).json(await assignCredentialToDevice(req.body ?? {}));
  } catch (error) {
    sendError(res, error, "Failed to assign credential");
  }
});

router.delete("/credential-assignments/:deviceId/:profileId", requireRole(["admin", "operator"]), async (req, res) => {
  const deviceId = Number(req.params.deviceId);
  if (!Number.isInteger(deviceId) || deviceId < 1) {
    res.status(400).json({ error: "Invalid device id" });
    return;
  }
  await removeCredentialAssignment(deviceId, String(req.params.profileId));
  res.status(204).end();
});

export default router;

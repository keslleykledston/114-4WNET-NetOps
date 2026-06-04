import type { Request, Response } from "express";
import { getRequestSourceIp } from "../../lib/audit.js";
import {
  analyzeBgpPeerCleanup,
  auditBgpCleanupCreation,
  exportBgpPeerCleanupAnalysisById,
  getBgpPeerCleanupAnalysisById,
} from "./bgp-drill-cleanup.service.js";

function parseId(value: unknown): number | null {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePeerIp(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const peerIp = String(raw ?? "").trim();
  if (!peerIp || peerIp.length > 128) return null;
  return peerIp;
}

export async function postBgpPeerCleanupAnalyzeHandler(req: Request, res: Response): Promise<void> {
  try {
    const deviceId = parseId(req.params.id);
    const peerIp = parsePeerIp(req.params.peerIp);
    if (!deviceId) {
      res.status(400).json({ error: "Invalid device ID" });
      return;
    }
    if (!peerIp) {
      res.status(400).json({ error: "Invalid peer IP" });
      return;
    }

    const result = await analyzeBgpPeerCleanup({
      deviceId,
      peerIp,
      request: req.body && typeof req.body === "object" ? { validateReadOnly: req.body.validateReadOnly === true } : undefined,
    });
    if (result === "device_not_found") {
      res.status(404).json({ error: "Device not found" });
      return;
    }
    if (result === "peer_not_found") {
      res.status(404).json({ error: "Peer not found in current snapshot" });
      return;
    }
    if (result === "peer_established_protected") {
      res.status(409).json({ error: "Peer Established não pode ser planejado para remoção" });
      return;
    }
    if (result === "no_config") {
      res.status(422).json({ error: "No discovery snapshot available for device" });
      return;
    }

    await auditBgpCleanupCreation(result, getRequestSourceIp(req));
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to analyze cleanup" });
  }
}

export async function getBgpPeerCleanupAnalysisHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid analysis ID" });
      return;
    }

    const result = await getBgpPeerCleanupAnalysisById(id);
    if (!result) {
      res.status(404).json({ error: "Cleanup analysis not found" });
      return;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load cleanup analysis" });
  }
}

export async function postBgpPeerCleanupExportHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid analysis ID" });
      return;
    }

    const result = await exportBgpPeerCleanupAnalysisById({
      id,
      sourceIp: getRequestSourceIp(req),
    });
    if (result === "not_found") {
      res.status(404).json({ error: "Cleanup analysis not found" });
      return;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to export cleanup analysis" });
  }
}

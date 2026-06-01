import type { Request, Response } from "express";
import type { BgpPolicyEditorPreviewRequest } from "./bgp-policy-editor.types.js";
import { previewBgpPolicyEditor } from "./bgp-policy-editor.service.js";

function queryOne(value: unknown): string | undefined {
  if (Array.isArray(value)) return value[0];
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function parseDeviceId(value: unknown): number | null {
  const parsed = Number(queryOne(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePeer(value: unknown): string | null {
  const decoded = decodeURIComponent(queryOne(value) ?? "").trim();
  if (!decoded || decoded.length > 128) return null;
  return decoded;
}

function parsePreviewBody(body: unknown): BgpPolicyEditorPreviewRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const nodeEditsValue = record.nodeEdits;
  if (!Array.isArray(nodeEditsValue)) return null;

  const nodeEdits = nodeEditsValue
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const item = entry as Record<string, unknown>;
      const nodeId = typeof item.nodeId === "string" ? item.nodeId.trim() : "";
      if (!nodeId) return null;
      const selectedCommunities = Array.isArray(item.selectedCommunities)
        ? item.selectedCommunities.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [];
      return { nodeId, selectedCommunities };
    })
    .filter((entry): entry is { nodeId: string; selectedCommunities: string[] } => entry !== null);

  return {
    routePolicyName: typeof record.routePolicyName === "string" ? record.routePolicyName.trim() || null : null,
    nodeEdits,
  };
}

export async function postBgpPolicyEditorPreviewHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.params.deviceId as unknown);
  const peer = parsePeer(req.params.peer as unknown);
  if (!deviceId) {
    res.status(400).json({ error: "Invalid device ID" });
    return;
  }
  if (!peer) {
    res.status(400).json({ error: "Invalid peer address or name" });
    return;
  }

  const body = parsePreviewBody(req.body);
  if (!body) {
    res.status(400).json({ error: "Invalid policy editor preview request body" });
    return;
  }

  const result = await previewBgpPolicyEditor(deviceId, peer, body);
  if (result === "device_not_found") {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  if (result === "no_config") {
    res.status(422).json({ error: "No snapshot or collected config available for device" });
    return;
  }

  res.json(result);
}

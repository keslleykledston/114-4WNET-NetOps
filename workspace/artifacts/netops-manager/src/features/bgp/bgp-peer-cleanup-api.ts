import { useMutation } from "@tanstack/react-query";
import type { BgpPeerCleanupAnalysis, BgpPeerCleanupExportResponse } from "@/features/bgp-cleanup-types";

export interface BgpPeerCleanupAnalyzeInput {
  deviceId: number;
  peerIp: string;
  validateReadOnly?: boolean;
}

async function parseJsonError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  throw new Error(body.message ?? body.error ?? fallback);
}

export async function analyzeBgpPeerCleanup(input: BgpPeerCleanupAnalyzeInput): Promise<BgpPeerCleanupAnalysis> {
  const res = await fetch(`/api/devices/${input.deviceId}/bgp/peers/${encodeURIComponent(input.peerIp)}/cleanup/analyze`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ validateReadOnly: input.validateReadOnly === true }),
  });
  if (!res.ok) return parseJsonError(res, `Cleanup analysis failed (${res.status})`);
  return res.json() as Promise<BgpPeerCleanupAnalysis>;
}

export async function getBgpPeerCleanupAnalysis(analysisId: number): Promise<BgpPeerCleanupAnalysis> {
  const res = await fetch(`/api/bgp-cleanup-analyses/${analysisId}`, { credentials: "include" });
  if (!res.ok) return parseJsonError(res, `Cleanup analysis not found (${res.status})`);
  return res.json() as Promise<BgpPeerCleanupAnalysis>;
}

export async function exportBgpPeerCleanupAnalysis(analysisId: number): Promise<BgpPeerCleanupExportResponse> {
  const res = await fetch(`/api/bgp-cleanup-analyses/${analysisId}/export`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) return parseJsonError(res, `Cleanup export failed (${res.status})`);
  return res.json() as Promise<BgpPeerCleanupExportResponse>;
}

export function useBgpPeerCleanupAnalyze() {
  return useMutation({
    mutationFn: analyzeBgpPeerCleanup,
  });
}

export function useBgpPeerCleanupExport() {
  return useMutation({
    mutationFn: ({ analysisId }: { analysisId: number }) => exportBgpPeerCleanupAnalysis(analysisId),
  });
}

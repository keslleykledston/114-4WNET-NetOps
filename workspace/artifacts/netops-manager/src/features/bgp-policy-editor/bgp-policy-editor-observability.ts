import type { BgpPolicyEditorPreviewFindingCode, BgpPolicyEditorPreviewSource } from "./bgp-policy-editor.types";

export const BGP_POLICY_EDITOR_PREVIEW_EVENTS = {
  BACKEND_SUCCESS: "preview_backend_success",
  BACKEND_FAILED: "preview_backend_failed",
  LOCAL_USED: "preview_local_used",
  LOCAL_FALLBACK_USED: "preview_local_fallback_used",
  DRIFT_DETECTED: "preview_drift_detected",
} as const;

export type BgpPolicyEditorPreviewEventName =
  (typeof BGP_POLICY_EDITOR_PREVIEW_EVENTS)[keyof typeof BGP_POLICY_EDITOR_PREVIEW_EVENTS];

export interface BgpPolicyEditorPreviewEvent {
  event: BgpPolicyEditorPreviewEventName;
  timestamp: string;
  deviceId: number;
  peer: string;
  routePolicyName: string | null;
  previewSource: BgpPolicyEditorPreviewSource;
  driftDetected: boolean;
  findings: BgpPolicyEditorPreviewFindingCode[];
  backendStatus?: "success" | "failed" | "fallback";
  backendErrorKind?: "http" | "network" | "unknown";
}

declare global {
  interface Window {
    __BGP_POLICY_EDITOR_OBSERVABILITY__?: BgpPolicyEditorPreviewEvent[];
  }
}

function isDevelopmentEnvironment(): boolean {
  return import.meta.env.DEV || import.meta.env.MODE === "development";
}

function appendBrowserEvent(event: BgpPolicyEditorPreviewEvent) {
  if (!isDevelopmentEnvironment() || typeof window === "undefined") return;
  const bucket = (window.__BGP_POLICY_EDITOR_OBSERVABILITY__ ??= []);
  bucket.push(event);
  console.debug("[bgp-policy-editor]", event);
}

export function emitBgpPolicyEditorPreviewEvent(event: BgpPolicyEditorPreviewEvent) {
  appendBrowserEvent({
    ...event,
    findings: [...new Set(event.findings)],
  });
}

export function classifyPreviewBackendError(error: string | null | undefined): "http" | "network" | "unknown" {
  if (!error) return "unknown";
  const normalized = error.toLowerCase();
  if (normalized.includes("http") || normalized.includes("status")) return "http";
  if (normalized.includes("network") || normalized.includes("fetch")) return "network";
  return "unknown";
}

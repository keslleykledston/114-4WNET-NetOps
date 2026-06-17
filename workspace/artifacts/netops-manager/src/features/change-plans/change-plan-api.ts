import type {
  ChangePlanDetail,
  ChangePlanExportResponse,
  ChangePlanSummary,
  ChangePlanWorkflowStatus,
  ReviewAction,
} from "./change-plan-types";

async function parseJsonError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  throw new Error(body.message ?? body.error ?? fallback);
}

export async function listChangePlans(params: {
  module?: string;
  status?: string;
  workflowStatus?: ChangePlanWorkflowStatus;
  deviceId?: number;
  limit?: number;
}): Promise<{ items: ChangePlanSummary[]; total: number }> {
  const search = new URLSearchParams();
  if (params.module) search.set("module", params.module);
  if (params.status) search.set("status", params.status);
  if (params.workflowStatus) search.set("workflowStatus", params.workflowStatus);
  if (params.deviceId != null) search.set("deviceId", String(params.deviceId));
  if (params.limit != null) search.set("limit", String(params.limit));
  const qs = search.toString();
  const res = await fetch(`/api/change-plans${qs ? `?${qs}` : ""}`, { credentials: "include" });
  if (!res.ok) return parseJsonError(res, `Change plans list failed (${res.status})`);
  return res.json() as Promise<{ items: ChangePlanSummary[]; total: number }>;
}

export async function getChangePlan(changePlanId: number): Promise<ChangePlanDetail> {
  const res = await fetch(`/api/change-plans/${changePlanId}`, { credentials: "include" });
  if (!res.ok) return parseJsonError(res, `Change plan not found (${res.status})`);
  return res.json() as Promise<ChangePlanDetail>;
}

export async function applyReviewAction(
  changePlanId: number,
  action: ReviewAction,
  note?: string,
): Promise<ChangePlanDetail> {
  const pathMap: Record<ReviewAction, string> = {
    "submit-review": "submit-review",
    "request-changes": "request-changes",
    reject: "reject",
    "approve-manual": "approve-manual",
    archive: "archive",
  };
  const res = await fetch(`/api/change-plans/${changePlanId}/${pathMap[action]}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(note ? { note } : {}),
  });
  if (!res.ok) return parseJsonError(res, `Review action failed (${res.status})`);
  return res.json() as Promise<ChangePlanDetail>;
}

export async function exportChangePlan(changePlanId: number, format: "markdown" | "json" = "markdown"): Promise<ChangePlanExportResponse> {
  const res = await fetch(`/api/change-plans/${changePlanId}/export`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format }),
  });
  if (!res.ok) return parseJsonError(res, `Change plan export failed (${res.status})`);
  return res.json() as Promise<ChangePlanExportResponse>;
}

export async function getChangePlanDiff(changePlanId: number) {
  const res = await fetch(`/api/change-plans/${changePlanId}/diff`, { credentials: "include" });
  if (!res.ok) return parseJsonError(res, `Change plan diff not found (${res.status})`);
  return res.json() as Promise<{ changePlanId: number; diff: ChangePlanDetail["diff"] }>;
}

export async function listDeviceChangePlans(deviceId: number, peerIp?: string) {
  const params = new URLSearchParams();
  if (peerIp) params.set("peerIp", peerIp);
  const query = params.toString();
  const res = await fetch(`/api/change-plans/device/${deviceId}${query ? `?${query}` : ""}`, { credentials: "include" });
  if (!res.ok) return parseJsonError(res, `Device change plans failed (${res.status})`);
  return res.json() as Promise<{ items: ChangePlanSummary[]; total: number }>;
}

import type {
  ChangePlanRow,
  CommunitySetRow,
  MatrixResponse,
  PreviewChangeResponse,
  SnapshotRefreshResult,
  SnapshotSummary,
  TargetEvidence,
  UpstreamAuditReport,
} from "./announcement-types";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json() as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function fetchAnnouncementFeature(): Promise<{
  enabled: boolean;
  previewEnabled: boolean;
  upstreamAuditEnabled: boolean;
}> {
  return apiFetch("/api/bgp/announcements/feature");
}

export function fetchAnnouncementMatrix(deviceId: number, params?: {
  family?: string;
  targetType?: string;
  search?: string;
  snapshotId?: number;
}): Promise<MatrixResponse> {
  const query = new URLSearchParams({ deviceId: String(deviceId) });
  if (params?.family) query.set("family", params.family);
  if (params?.targetType) query.set("targetType", params.targetType);
  if (params?.search) query.set("search", params.search);
  if (params?.snapshotId != null) query.set("snapshotId", String(params.snapshotId));
  return apiFetch(`/api/bgp/announcements/matrix?${query}`);
}

export function fetchLatestMatrixSnapshot(deviceId: number): Promise<SnapshotSummary> {
  return apiFetch(`/api/bgp/announcements/snapshots/latest?deviceId=${deviceId}`);
}

export function fetchMatrixSnapshots(deviceId: number, limit = 20): Promise<{ deviceId: number; snapshots: SnapshotSummary[] }> {
  return apiFetch(`/api/bgp/announcements/snapshots?deviceId=${deviceId}&limit=${limit}`);
}

export function refreshMatrixSnapshot(deviceId: number): Promise<SnapshotRefreshResult> {
  return apiFetch("/api/bgp/announcements/snapshots/refresh", {
    method: "POST",
    body: JSON.stringify({ deviceId }),
  });
}

export function fetchTargetEvidence(deviceId: number, targetKey: string, upstreamCircuitId: string): Promise<TargetEvidence> {
  const query = new URLSearchParams({
    deviceId: String(deviceId),
    targetKey,
    upstreamCircuitId,
  });
  return apiFetch(`/api/bgp/announcements/evidence?${query}`);
}

export function previewAnnouncementChange(body: {
  deviceId: number;
  targetPolicyName: string;
  node: number;
  family: "ipv4" | "ipv6";
  upstreamCircuitId: string;
  newState: string;
}): Promise<PreviewChangeResponse> {
  return apiFetch("/api/bgp/announcements/preview-change", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createChangePlan(body: {
  deviceId: number;
  preview: PreviewChangeResponse;
  upstreamCircuitId: string;
  upstreamName: string;
  targetType: string;
  family: "ipv4" | "ipv6";
  newState: string;
}): Promise<ChangePlanRow> {
  return apiFetch("/api/bgp/announcements/change-plans", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchChangePlans(deviceId: number): Promise<ChangePlanRow[]> {
  return apiFetch(`/api/bgp/announcements/change-plans?deviceId=${deviceId}`);
}

export function fetchUpstreamAudit(deviceId: number): Promise<UpstreamAuditReport> {
  return apiFetch(`/api/bgp/upstreams/audit?deviceId=${deviceId}`);
}

export function fetchCommunitySets(deviceId: number): Promise<CommunitySetRow[]> {
  return apiFetch(`/api/bgp/community-sets?deviceId=${deviceId}`);
}

export function createAnnouncementChangePreview(body: {
  deviceId: number;
  snapshotId?: number;
  targetId: string;
  actionType: string;
  upstreamCircuitId?: string;
  newState?: string;
  community?: string;
  prependCount?: number;
}): Promise<import("./announcement-types").AnnouncementChangePreview> {
  return apiFetch("/api/bgp/announcements/change-preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchAnnouncementChangePreview(previewId: number): Promise<import("./announcement-types").AnnouncementChangePreview> {
  return apiFetch(`/api/bgp/announcements/change-preview/${previewId}`);
}

export function fetchAnnouncementChangePreviews(params: {
  deviceId?: number;
  snapshotId?: number;
  targetId?: string;
}): Promise<{ previews: import("./announcement-types").AnnouncementChangePreview[] }> {
  const query = new URLSearchParams();
  if (params.deviceId != null) query.set("deviceId", String(params.deviceId));
  if (params.snapshotId != null) query.set("snapshotId", String(params.snapshotId));
  if (params.targetId) query.set("targetId", params.targetId);
  return apiFetch(`/api/bgp/announcements/change-preview?${query}`);
}

export function syncCommunitySets(deviceId: number): Promise<{ synced: number }> {
  return apiFetch("/api/bgp/community-sets/sync", {
    method: "POST",
    body: JSON.stringify({ deviceId }),
  });
}

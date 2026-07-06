import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export type BgpRegistryCustomer = {
  id: number;
  name: string;
  code: string;
  asn: number;
  type: string;
  status: string;
  notes: string | null;
};

export type BgpRegistryConnection = Record<string, unknown> & { id: number; customerId: number; deviceId: number; status: string };
export type BgpRegistryPrefix = Record<string, unknown> & { id: number; customerId: number; prefix: string; addressFamily: string };
export type BgpRegistryExitPoint = Record<string, unknown> & { id: number; name: string; slug: string };
export type BgpRegistryCommunityAction = Record<string, unknown> & { id: number; exitPointId: number; action: string; community: string };
export type BgpRegistryAnnouncementState = {
  customer: BgpRegistryCustomer;
  connections: BgpRegistryConnection[];
  prefixes: BgpRegistryPrefix[];
  exitPoints: BgpRegistryExitPoint[];
  actions: BgpRegistryCommunityAction[];
  previewReady: boolean;
  engine: string;
};
export type BgpAnnouncementMatrixPayload = {
  columns: Array<{ key: string; label: string; upstreamCircuitId: string; upstreamName: string; role?: string | null }>;
  rows: Array<{ routePolicyName?: string; targetPolicyName?: string; family: string; prefixScope?: { name: string }; cells: Record<string, { state: string; label?: string | null; community?: string | null }>; risk?: string }>;
  summary?: Record<string, unknown>;
};
export type BgpRegistryReconcileResult = {
  customer: BgpRegistryCustomer;
  deviceId: number | null;
  matrix: unknown;
  actions: Array<Record<string, unknown>>;
  mismatchCount: number;
  mismatches: Array<{ kind: string; message: string; community?: string; label?: string; row?: string; exit?: string }>;
};
export type BgpRegistryPreviewResult = Record<string, unknown> & { previewId?: string; targetPolicyName?: string; desiredState?: string; findings?: Array<Record<string, unknown>> };

const key = {
  customers: ["bgp-registry", "customers"],
  connections: (customerId?: number | null) => ["bgp-registry", "connections", customerId],
  prefixes: (customerId?: number | null) => ["bgp-registry", "prefixes", customerId],
  exitPoints: ["bgp-registry", "exit-points"],
  actions: (exitPointId?: number | null) => ["bgp-registry", "actions", exitPointId],
  state: (customerId: number | null) => ["bgp-registry", "state", customerId],
  matrix: (deviceId: number | null) => ["bgp-registry", "matrix", deviceId],
};

export function useBgpRegistryCustomers() {
  return useQuery({ queryKey: key.customers, queryFn: () => apiFetch<BgpRegistryCustomer[]>("/api/bgp/registry/customers") });
}
export function useBgpRegistryConnections(customerId: number | null) {
  return useQuery({ queryKey: key.connections(customerId), queryFn: () => apiFetch<BgpRegistryConnection[]>(`/api/bgp/registry/connections${customerId ? `?customerId=${customerId}` : ""}`) });
}
export function useBgpRegistryPrefixes(customerId: number | null) {
  return useQuery({ queryKey: key.prefixes(customerId), queryFn: () => apiFetch<BgpRegistryPrefix[]>(`/api/bgp/registry/prefixes${customerId ? `?customerId=${customerId}` : ""}`) });
}
export function useBgpRegistryExitPoints() {
  return useQuery({ queryKey: key.exitPoints, queryFn: () => apiFetch<BgpRegistryExitPoint[]>("/api/bgp/registry/exit-points") });
}
export function useBgpRegistryActions(exitPointId: number | null) {
  return useQuery({ queryKey: key.actions(exitPointId), queryFn: () => apiFetch<BgpRegistryCommunityAction[]>(`/api/bgp/registry/community-actions${exitPointId ? `?exitPointId=${exitPointId}` : ""}`) });
}
export function useBgpRegistryAnnouncementState(customerId: number | null) {
  return useQuery({ queryKey: key.state(customerId), queryFn: () => apiFetch<BgpRegistryAnnouncementState>(`/api/bgp/registry/customers/${customerId}/announcement-state`), enabled: customerId != null });
}
export function useBgpRegistryReconcile(customerId: number | null) {
  return useQuery({ queryKey: ["bgp-registry", "reconcile", customerId], queryFn: () => apiFetch<BgpRegistryReconcileResult>(`/api/bgp/registry/customers/${customerId}/reconcile`), enabled: customerId != null });
}
export function useBgpRegistryPreview(customerId: number | null, deviceId: number | null, desiredState: string, rowIndex: number, exitIndex: number) {
  return useQuery({
    queryKey: ["bgp-registry", "preview", customerId, deviceId, desiredState, rowIndex, exitIndex],
    queryFn: () => apiFetch<BgpRegistryPreviewResult>(`/api/bgp/registry/customers/${customerId}/preview`, { method: "POST", body: JSON.stringify({ deviceId, desiredState, rowIndex, exitIndex }) }),
    enabled: customerId != null,
  });
}
export function useBgpAnnouncementMatrixLatest(deviceId: number | null) {
  return useQuery({ queryKey: key.matrix(deviceId), queryFn: () => apiFetch<BgpAnnouncementMatrixPayload>(`/api/bgp/announcements/matrix/latest?deviceId=${deviceId}`), enabled: deviceId != null });
}

export function useCreateBgpRegistryEntity(path: string, invalidateKeys: Array<readonly unknown[]>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch(path, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => { await Promise.all(invalidateKeys.map((queryKey) => client.invalidateQueries({ queryKey }))); },
  });
}

export function useDeleteBgpRegistryEntity(pathForId: (id: number) => string, invalidateKeys: Array<readonly unknown[]>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(pathForId(id), { method: "DELETE" }),
    onSuccess: async () => { await Promise.all(invalidateKeys.map((queryKey) => client.invalidateQueries({ queryKey }))); },
  });
}

export function usePatchBgpRegistryEntity(pathForId: (id: number) => string, invalidateKeys: Array<readonly unknown[]>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiFetch(pathForId(id), { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: async () => { await Promise.all(invalidateKeys.map((queryKey) => client.invalidateQueries({ queryKey }))); },
  });
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}

// Graph (loom format)
export async function fetchTopologyGraph(querySuffix = ""): Promise<any> {
  return apiFetch(`/api/topology/graph${querySuffix}`);
}

// Summary
export async function fetchTopologySummary(): Promise<any> {
  return apiFetch("/api/topology/summary");
}

// Device
export async function fetchDeviceTopology(deviceId: number): Promise<any> {
  return apiFetch(`/api/topology/device/${deviceId}`);
}

// Rebuild
export async function rebuildTopology(scope?: string, scopeId?: number): Promise<any> {
  return apiFetch("/api/topology/rebuild", {
    method: "POST",
    body: JSON.stringify({ scope, scopeId }),
  });
}

// Orphans
export async function fetchOrphans(): Promise<any[]> {
  return apiFetch("/api/topology/orphans");
}

export async function fetchOrphansSummary(): Promise<any> {
  return apiFetch("/api/topology/orphans/summary");
}

// Clear
export async function clearTopology(): Promise<any> {
  return apiFetch("/api/topology/clear", { method: "POST" });
}

export type LinkUtilizationInput = {
  linkId: string;
  sourceDeviceId: number;
  intfA: string;
  targetDeviceId: number;
  intfB: string;
};

export type LinkUtilizationResult = {
  linkId: string;
  utilizationPct: number | null;
  sourceUtilPct: number | null;
  targetUtilPct: number | null;
};

export async function fetchLinkUtilization(links: LinkUtilizationInput[]): Promise<LinkUtilizationResult[]> {
  const data = await apiFetch<{ links: LinkUtilizationResult[] }>("/api/topology/link-utilization", {
    method: "POST",
    body: JSON.stringify({ links }),
  });
  return data.links;
}

export async function fetchDeviceInterfaceUtilization(deviceId: number): Promise<Record<string, number>> {
  const data = await apiFetch<{ interfaces: Record<string, number> }>(
    `/api/topology/device/${deviceId}/interface-utilization`,
  );
  return data.interfaces ?? {};
}

export type MapLayoutPayload = {
  devices: unknown[];
  links: unknown[];
  positions: Record<string, { x: number; y: number }>;
};

export type MapLayoutDetail = {
  id: number;
  name: string;
  isActive: boolean;
  updatedAt: string;
  createdAt: string;
  payload: MapLayoutPayload;
};

export type MapLayoutSummary = Pick<MapLayoutDetail, "id" | "name" | "isActive" | "updatedAt" | "createdAt">;

export async function fetchMapLayouts(): Promise<MapLayoutSummary[]> {
  const data = await apiFetch<{ layouts: MapLayoutSummary[] }>("/api/topology/map-layouts");
  return data.layouts ?? [];
}

export async function fetchActiveMapLayout(): Promise<MapLayoutDetail | null> {
  const data = await apiFetch<{ layout: MapLayoutDetail | null }>("/api/topology/map-layout/active");
  return data.layout ?? null;
}

export async function fetchMapLayout(id: number): Promise<MapLayoutDetail> {
  const data = await apiFetch<{ layout: MapLayoutDetail }>(`/api/topology/map-layouts/${id}`);
  return data.layout;
}

export async function saveMapLayout(input: {
  id?: number;
  name: string;
  devices: unknown[];
  links: unknown[];
  positions: Record<string, { x: number; y: number }>;
  setActive?: boolean;
}): Promise<MapLayoutDetail> {
  const data = await apiFetch<{ layout: MapLayoutDetail }>("/api/topology/map-layouts", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.layout;
}

export async function activateMapLayout(id: number): Promise<MapLayoutDetail> {
  const data = await apiFetch<{ layout: MapLayoutDetail }>(`/api/topology/map-layouts/${id}/activate`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data.layout;
}

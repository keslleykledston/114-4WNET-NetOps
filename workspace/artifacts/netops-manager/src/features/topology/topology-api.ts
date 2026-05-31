async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data as T;
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

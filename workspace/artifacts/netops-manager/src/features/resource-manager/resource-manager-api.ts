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

// Pools
export async function fetchResourcePools(resourceType?: string): Promise<any[]> {
  const url = resourceType ? `/api/resources/pools?resourceType=${resourceType}` : "/api/resources/pools";
  return apiFetch(url);
}

export interface CreatePoolInput {
  name: string;
  resourceType: string;
  rangeStart: number;
  rangeEnd: number;
  vendor?: string;
  tenantId?: number;
  siteId?: number;
  metadata?: Record<string, any>;
}

export async function createResourcePool(data: CreatePoolInput): Promise<any> {
  return apiFetch("/api/resources/pools", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Allocations
export async function fetchAllocations(poolId?: number, status?: string): Promise<any[]> {
  let url = "/api/resources/allocations";
  if (poolId || status) {
    url += "?";
    if (poolId) url += `poolId=${poolId}`;
    if (status) url += `${poolId ? "&" : ""}status=${status}`;
  }
  return apiFetch(url);
}

export interface AllocateInput {
  poolId: number;
  resourceValue?: number;
  deviceId?: number;
  serviceRequestId?: number;
}

export async function allocateResource(data: AllocateInput): Promise<any> {
  return apiFetch("/api/resources/allocate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getNextAvailable(poolId: number): Promise<any> {
  return apiFetch(`/api/resources/next/${poolId}`);
}

export async function releaseResource(allocationId: number): Promise<void> {
  await apiFetch(`/api/resources/release/${allocationId}`, { method: "POST" });
}

// Reservations
export interface ReserveInput {
  poolId: number;
  resourceValue: number;
  expiresAt: string;
}

export async function reserveResource(data: ReserveInput): Promise<any> {
  return apiFetch("/api/resources/reserve", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Usage & Search
export async function getPoolUsage(poolId: number): Promise<any> {
  return apiFetch(`/api/resources/usage/${poolId}`);
}

export async function searchResources(searchTerm: string): Promise<any[]> {
  return apiFetch(`/api/resources/search?q=${encodeURIComponent(searchTerm)}`);
}

// Collisions
export async function fetchCollisions(): Promise<any[]> {
  return apiFetch("/api/resources/collisions");
}

export interface CheckCollisionInput {
  type: "VLAN" | "VC_ID" | "RD" | "RT" | "LOOPBACK" | "SERVICE_ID";
  value: number | string;
}

export async function checkCollision(data: CheckCollisionInput): Promise<any> {
  return apiFetch("/api/resources/collisions/check", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchCollisionReport(): Promise<any> {
  return apiFetch("/api/resources/report");
}

// Cleanup
export async function cleanupReservations(): Promise<any> {
  return apiFetch("/api/resources/cleanup", { method: "POST" });
}

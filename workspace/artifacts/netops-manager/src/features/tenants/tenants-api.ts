async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type TenantStatus = "active" | "inactive";

export type Tenant = {
  id: number;
  name: string;
  slug: string;
  status: TenantStatus;
  created_at: string;
  updated_at: string;
};

export type TenantDetail = Tenant & {
  connector_count: number;
  user_count: number;
  profile_count: number;
};

export function listTenants() {
  return apiFetch<{ items: TenantDetail[] }>("/api/tenants").then((data) => data.items);
}

export function getTenant(id: number) {
  return apiFetch<TenantDetail>(`/api/tenants/${id}`);
}

export function createTenant(input: { name: string; slug?: string; status?: TenantStatus }) {
  return apiFetch<Tenant>("/api/tenants", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTenant(id: number, input: { name?: string; slug?: string; status?: TenantStatus }) {
  return apiFetch<TenantDetail>(`/api/tenants/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteTenant(id: number) {
  return apiFetch<void>(`/api/tenants/${id}`, { method: "DELETE" });
}

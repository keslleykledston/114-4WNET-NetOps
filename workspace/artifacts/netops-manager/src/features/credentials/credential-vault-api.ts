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

export type CredentialType = "SSH" | "SNMP_V2" | "SNMP_V3" | "NETCONF" | "API_TOKEN";

export type CredentialProfile = {
  id: string;
  tenant_id: number;
  tenant_name?: string;
  name: string;
  type: CredentialType;
  vendor: string | null;
  username: string | null;
  is_active: boolean;
  secret_configured: boolean;
  created_at: string;
  updated_at: string;
};

export type CredentialAssignment = {
  device_id: number;
  device_hostname?: string;
  credential_profile_id: string;
  credential_name?: string;
  credential_type?: string;
  priority: number;
  created_at: string;
};

export function listCredentialProfiles() {
  return apiFetch<CredentialProfile[]>("/api/credential-profiles");
}

export function createCredentialProfile(input: {
  id?: string;
  tenant_id: number;
  name: string;
  type: CredentialType;
  vendor?: string;
  username?: string;
  secret: string;
  is_active?: boolean;
}) {
  return apiFetch<CredentialProfile>("/api/credential-profiles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCredentialProfile(id: string, input: Partial<Omit<CredentialProfile, "tenant_name" | "created_at" | "updated_at" | "secret_configured">>) {
  return apiFetch<CredentialProfile>(`/api/credential-profiles/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function rotateCredentialProfile(id: string, secret: string) {
  return apiFetch<CredentialProfile>(`/api/credential-profiles/${encodeURIComponent(id)}/rotate`, {
    method: "POST",
    body: JSON.stringify({ secret }),
  });
}

export function deleteCredentialProfile(id: string) {
  return fetch(`/api/credential-profiles/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  }).then((response) => {
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
  });
}

export function listCredentialAssignments(deviceId?: number) {
  const suffix = deviceId ? `?device_id=${deviceId}` : "";
  return apiFetch<CredentialAssignment[]>(`/api/credential-assignments${suffix}`);
}

export function assignCredential(input: { device_id: number; credential_profile_id: string; priority?: number }) {
  return apiFetch<CredentialAssignment>("/api/credential-assignments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function removeCredentialAssignment(deviceId: number, profileId: string) {
  return fetch(`/api/credential-assignments/${deviceId}/${encodeURIComponent(profileId)}`, {
    method: "DELETE",
    credentials: "include",
  }).then((response) => {
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
  });
}

export function testCredential(id: string, deviceId: number) {
  return apiFetch<{ success: boolean; status: string; job_id: number; message: string }>(
    `/api/credential-profiles/${encodeURIComponent(id)}/test`,
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId }),
    },
  );
}

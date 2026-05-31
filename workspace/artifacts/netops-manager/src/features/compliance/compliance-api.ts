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

// Dashboard
export async function fetchComplianceDashboard(): Promise<any> {
  return apiFetch("/api/compliance/dashboard");
}

// Drifts
export async function fetchComplianceDrifts(deviceId?: number): Promise<any[]> {
  const url = deviceId ? `/api/compliance/drifts?deviceId=${deviceId}` : "/api/compliance/drifts";
  return apiFetch(url);
}

// Device Compliance
export async function fetchDeviceCompliance(deviceId: number): Promise<any> {
  return apiFetch(`/api/devices/${deviceId}/compliance`);
}

export async function fetchDeviceDrifts(deviceId: number): Promise<any[]> {
  return apiFetch(`/api/devices/${deviceId}/drift`);
}

export async function triggerComplianceRun(deviceId: number): Promise<any> {
  return apiFetch(`/api/compliance/run/device/${deviceId}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// Baselines
export async function fetchBaselines(scopeType?: string): Promise<any[]> {
  const url = scopeType ? `/api/compliance/baselines?scopeType=${scopeType}` : "/api/compliance/baselines";
  return apiFetch(url);
}

export async function fetchBaseline(id: number): Promise<any> {
  return apiFetch(`/api/compliance/baselines/${id}`);
}

export interface CreateBaselineInput {
  scopeType: string;
  scopeId?: string;
  name: string;
  description?: string;
  rulesJson?: Record<string, any>;
  enabled?: boolean;
}

export async function createBaseline(data: CreateBaselineInput): Promise<any> {
  return apiFetch("/api/compliance/baselines", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface UpdateBaselineInput {
  name?: string;
  description?: string;
  rulesJson?: Record<string, any>;
  enabled?: boolean;
}

export async function updateBaseline(id: number, data: UpdateBaselineInput): Promise<any> {
  return apiFetch(`/api/compliance/baselines/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteBaseline(id: number): Promise<void> {
  await apiFetch(`/api/compliance/baselines/${id}`, {
    method: "DELETE",
  });
}

// Rules
export async function fetchRules(): Promise<any[]> {
  return apiFetch("/api/compliance/rules");
}

export async function updateRule(id: number, data: { enabled?: boolean; severity?: string }): Promise<any> {
  return apiFetch(`/api/compliance/rules/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// Trends
export async function fetchTrends(
  scope: "device" | "site" | "vendor" | "global",
  scopeId?: string | number,
  days?: number
): Promise<any[]> {
  let url = `/api/compliance/trends?scope=${scope}`;
  if (scopeId) url += `&scopeId=${scopeId}`;
  if (days) url += `&days=${days}`;
  return apiFetch(url);
}

// Schedules (v0.9.2)
export async function fetchComplianceSchedules(): Promise<any[]> {
  return apiFetch("/api/compliance/schedules");
}

export interface CreateScheduleInput {
  name: string;
  scopeType: "site" | "global" | "device";
  scopeId?: string;
  intervalHours?: number;
  contexts?: string[];
  enabled?: boolean;
}

export async function createComplianceSchedule(data: CreateScheduleInput): Promise<any> {
  return apiFetch("/api/compliance/schedules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateComplianceSchedule(id: number, data: Partial<CreateScheduleInput>): Promise<any> {
  return apiFetch(`/api/compliance/schedules/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteComplianceSchedule(id: number): Promise<void> {
  await apiFetch(`/api/compliance/schedules/${id}`, { method: "DELETE" });
}

export async function runComplianceScheduleNow(id: number): Promise<any> {
  return apiFetch(`/api/compliance/schedules/${id}/run-now`, { method: "POST", body: JSON.stringify({}) });
}

export async function fetchScheduleHistory(id: number): Promise<any[]> {
  return apiFetch(`/api/compliance/schedules/${id}/history`);
}

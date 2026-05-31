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
export async function fetchImpactSummary(): Promise<any> {
  return apiFetch("/api/impact/summary");
}

// Analyze
export interface AnalyzeInput {
  targetType: string;
  targetId: number;
}

export async function analyzeImpact(data: AnalyzeInput): Promise<any> {
  return apiFetch("/api/impact/analyze", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Scenarios
export async function fetchScenarios(status?: string): Promise<any[]> {
  const url = status ? `/api/impact/scenarios?status=${status}` : "/api/impact/scenarios";
  return apiFetch(url);
}

export async function fetchScenarioDetails(scenarioId: number): Promise<any> {
  return apiFetch(`/api/impact/scenarios/${scenarioId}`);
}

export async function acknowledgeScenario(scenarioId: number): Promise<void> {
  await apiFetch(`/api/impact/scenarios/${scenarioId}/ack`, { method: "POST" });
}

export async function resolveScenario(scenarioId: number): Promise<void> {
  await apiFetch(`/api/impact/scenarios/${scenarioId}/resolve`, { method: "POST" });
}

// Device
export async function fetchDeviceImpact(deviceId: number): Promise<any> {
  return apiFetch(`/api/devices/${deviceId}/impact`);
}

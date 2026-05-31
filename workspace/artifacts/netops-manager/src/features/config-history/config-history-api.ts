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

export type ConfigHistoryItem = {
  id: number;
  device_id: number;
  device_hostname: string | null;
  source: string | null;
  size_bytes: number;
  hash: string;
  parser_status: string | null;
  parser_error: string | null;
  collected_at: string;
  diff_id: number | null;
  previous_config_id: number | null;
};

export type ConfigDetail = ConfigHistoryItem & {
  raw_config: string | null;
  connector_id: number | null;
  connector_job_id: number | null;
  parsed_summary_json: Record<string, unknown> | null;
};

export type ConfigDiff = {
  id: number;
  device_id: number;
  previous_config_id: number | null;
  current_config_id: number;
  diff_summary: string | null;
  diff_text: string | null;
  created_at: string;
};

export function listDeviceConfigHistory(deviceId: number) {
  return apiFetch<ConfigHistoryItem[]>(`/api/devices/${deviceId}/config-history`);
}

export function getConfig(id: number) {
  return apiFetch<ConfigDetail>(`/api/configs/${id}`);
}

export function getConfigDiff(id: number) {
  return apiFetch<ConfigDiff>(`/api/configs/${id}/diff`);
}

export function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}

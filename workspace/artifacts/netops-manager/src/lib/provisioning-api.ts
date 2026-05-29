/** v0.4.0 provisioning preview endpoints (until Orval regen is run). */

export interface ProvisioningServiceTemplate {
  serviceType: string;
  name: string;
  description: string;
  configTemplateType: string;
  requiredParameters: string[];
  optionalParameters: string[];
  parameterSchema: Record<string, { type: string; description: string }>;
}

export interface ProvisioningPreviewResult {
  deviceId: number;
  serviceType: string;
  configPreview: string;
  rollbackPreview: string;
  validations: Array<{ name: string; passed: boolean; message: string; severity?: string }>;
  risks: string[];
  missingData: string[];
  maintenanceWindow: { start: string | null; end: string | null } | null;
  rollbackPlan: string | null;
  applyBlocked: boolean;
  applyBlockedReason: string | null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function listProvisioningServiceTemplates() {
  return apiFetch<ProvisioningServiceTemplate[]>("/api/provisioning/service-templates");
}

export function previewProvisioningConfig(body: {
  deviceId: number;
  serviceType: string;
  parameters: Record<string, string>;
  maintenanceWindowStart?: string;
  maintenanceWindowEnd?: string;
  rollbackPlan?: string;
}) {
  return apiFetch<ProvisioningPreviewResult>("/api/provisioning/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function requestProvisioningApproval(jobId: number) {
  return apiFetch(`/api/provisioning-jobs/${jobId}/request-approval`, { method: "POST" });
}

export function cancelProvisioningJob(jobId: number) {
  return apiFetch(`/api/provisioning-jobs/${jobId}/cancel`, { method: "POST" });
}

export function previewProvisioningJobMarkdown(jobId: number) {
  return apiFetch<{ previewMarkdown?: string } & Record<string, unknown>>(`/api/provisioning-jobs/${jobId}/preview`, { method: "POST" });
}

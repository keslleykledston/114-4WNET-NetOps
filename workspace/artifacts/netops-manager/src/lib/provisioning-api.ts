/** v0.4.0 provisioning preview endpoints (until Orval regen is run). */

export interface ProvisioningServiceTemplate {
  id: string;
  serviceType: string;
  name: string;
  description: string;
  configTemplateType: string;
  requiredParameters: string[];
  optionalParameters: string[];
  parameterSchema: Record<string, { type: string; description: string }>;
}

export interface ProvisioningPreviewResult {
  status: "valid" | "warning" | "blocked";
  deviceId: number;
  templateId: string;
  serviceType: string;
  configPreview: string;
  rollbackPreview: string;
  executionPlan: string[];
  validations: Array<{ name: string; passed: boolean; message: string; severity?: string }>;
  risks: Array<{ code?: string; message: string; severity?: string }>;
  missingData: string[];
  blockedReasons: string[];
  maintenanceWindow: { start: string | null; end: string | null } | null;
  rollbackPlan: string | null;
  applyBlocked: boolean;
  applyBlockedReason: string | null;
  commandsGenerated: string[];
  warnings: string[];
  conflicts: string[];
  missingResources: string[];
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
  templateId: string;
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

export interface ProvisioningJob {
  id: number;
  name: string;
  type: string;
  status: string;
  deviceIds: number[];
  parameters?: string | null;
  approvedByUserId?: number | null;
  approvedAt?: string | null;
  executionPlanJson?: string | null;
  rollbackPlanGenerated?: string | null;
  postcheckAt?: string | null;
  postcheckResult?: string | null;
  postcheckOutput?: string | null;
  maintenanceWindowStart?: string | null;
  maintenanceWindowEnd?: string | null;
  createdAt: string;
  templateId?: number | null;
  validatedAt?: string | null;
  executedAt?: string | null;
  completedAt?: string | null;
  errorMessage?: string | null;
}

export interface PostCheckResult {
  jobId: number;
  passed: boolean;
  status: "passed" | "failed" | "partial";
  output: string;
  timestamp: string;
}

export interface RollbackPreviewResult {
  jobId: number;
  rollbackPlan: string | null;
  generated: boolean;
}

export function approveProvisioningJob(jobId: number) {
  return apiFetch<ProvisioningJob>(`/api/provisioning-jobs/${jobId}/approve`, { method: "POST" });
}

export function executeProvisioningJob(jobId: number) {
  return apiFetch<ProvisioningJob>(`/api/provisioning-jobs/${jobId}/execute`, { method: "POST" });
}

export function postcheckProvisioningJob(jobId: number) {
  return apiFetch<PostCheckResult>(`/api/provisioning-jobs/${jobId}/postcheck`, { method: "POST" });
}

export function getRollbackPreview(jobId: number) {
  return apiFetch<RollbackPreviewResult>(`/api/provisioning-jobs/${jobId}/rollback-preview`);
}

export function rollbackProvisioningJob(jobId: number) {
  return apiFetch<ProvisioningJob>(`/api/provisioning-jobs/${jobId}/rollback`, { method: "POST" });
}

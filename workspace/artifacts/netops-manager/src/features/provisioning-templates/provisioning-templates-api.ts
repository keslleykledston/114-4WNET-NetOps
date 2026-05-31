import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface TemplateRegistryEntry {
  id: number;
  name: string;
  vendor: string;
  serviceType: string;
  version: string;
  status: "SYSTEM" | "CUSTOM" | "DRAFT" | "APPROVED" | "DEPRECATED";
  source: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateDetail extends TemplateRegistryEntry {
  variablesJson?: string | null;
  validationRulesJson?: string | null;
  templateBody?: string | null;
  createdBy?: string | null;
  approvedBy?: string | null;
  editable: boolean;
}

export interface TemplateVersion {
  id: number;
  version: string;
  status: string;
  changedBy?: string | null;
  changeReason?: string | null;
  createdAt: string;
}

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  line: string;
  lineNumber: number;
}

export interface TemplateAuditLog {
  id: number;
  actor: string;
  action: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
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
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const templateRegistryQueryKey = () => ["provisioning", "templates"];
const templateDetailQueryKey = (id: number) => ["provisioning", "templates", id];
const templateVersionsQueryKey = (id: number) => ["provisioning", "templates", id, "versions"];
const templateDiffQueryKey = (id: number, vA: string, vB: string) => ["provisioning", "templates", id, "diff", vA, vB];
const templateAuditQueryKey = (id: number) => ["provisioning", "templates", id, "audit"];

export function useTemplateRegistry(filters?: { status?: string; vendor?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.append("status", filters.status);
  if (filters?.vendor) params.append("vendor", filters.vendor);

  return useQuery({
    queryKey: templateRegistryQueryKey(),
    queryFn: () =>
      apiFetch<TemplateRegistryEntry[]>(
        `/api/provisioning/templates${params.size > 0 ? `?${params}` : ""}`,
      ),
  });
}

export function useTemplateDetail(id: number) {
  return useQuery({
    queryKey: templateDetailQueryKey(id),
    queryFn: () => apiFetch<TemplateDetail>(`/api/provisioning/templates/${id}`),
    enabled: !!id,
  });
}

export function useTemplateVersions(id: number) {
  return useQuery({
    queryKey: templateVersionsQueryKey(id),
    queryFn: () => apiFetch<TemplateVersion[]>(`/api/provisioning/templates/${id}/versions`),
    enabled: !!id,
  });
}

export function useTemplateDiff(id: number, vA: string, vB: string) {
  return useQuery({
    queryKey: templateDiffQueryKey(id, vA, vB),
    queryFn: () => apiFetch<DiffLine[]>(`/api/provisioning/templates/${id}/diff/${vA}/${vB}`),
    enabled: !!id && !!vA && !!vB,
  });
}

export function useTemplateAuditLogs(id: number) {
  return useQuery({
    queryKey: templateAuditQueryKey(id),
    queryFn: () => apiFetch<TemplateAuditLog[]>(`/api/provisioning/templates/${id}/audit`),
    enabled: !!id,
  });
}

export async function exportTemplate(id: number): Promise<Blob> {
  const res = await fetch(`/api/provisioning/templates/${id}/export`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Export failed: ${res.statusText}`);
  }
  return res.blob();
}

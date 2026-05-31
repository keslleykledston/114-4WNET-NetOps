import { useQuery } from "@tanstack/react-query";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

export interface TemplateDraft {
  id: number;
  draftBody: string;
  status: string;
  createdBy: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export function useDraftList() {
  return useQuery({ queryKey: ["studio", "drafts"], queryFn: () => apiFetch<TemplateDraft[]>("/api/provisioning/studio/drafts") });
}

export function useDraft(id: number) {
  return useQuery({ queryKey: ["studio", "drafts", id], queryFn: () => apiFetch<TemplateDraft>(`/api/provisioning/studio/drafts/${id}`), enabled: !!id });
}

export async function createDraft(draftBody: string) {
  return apiFetch(`/api/provisioning/studio/drafts`, { method: "POST", body: JSON.stringify({ draftBody }) });
}

export async function updateDraft(id: number, draftBody: string) {
  return apiFetch(`/api/provisioning/studio/drafts/${id}`, { method: "PUT", body: JSON.stringify({ draftBody }) });
}

export async function validateDraft(id: number) {
  return apiFetch(`/api/provisioning/studio/drafts/${id}/validate`, { method: "POST" });
}

export async function previewDraft(id: number) {
  return apiFetch<any>(`/api/provisioning/studio/drafts/${id}/preview`, { method: "POST" });
}

export async function approveDraft(id: number) {
  return apiFetch(`/api/provisioning/studio/drafts/${id}/approve`, { method: "POST" });
}

export async function rejectDraft(id: number, reason: string) {
  return apiFetch(`/api/provisioning/studio/drafts/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
}

export async function publishDraft(id: number) {
  return apiFetch(`/api/provisioning/studio/drafts/${id}/publish`, { method: "POST" });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NavModuleDefinition, NavModulesMap } from "./nav-modules";

export type UserProfile = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  modules: NavModulesMap;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserModulesResponse = {
  modules: NavModulesMap;
  profileId: number | null;
  profileName: string | null;
  isAdminBypass: boolean;
  catalog: NavModuleDefinition[];
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const userModulesQueryKey = ["auth", "me", "modules"] as const;
export const userProfilesQueryKey = ["user-profiles"] as const;

export function fetchUserModules() {
  return apiFetch<UserModulesResponse>("/api/auth/me/modules");
}

export function useUserModules(enabled = true) {
  return useQuery({
    queryKey: userModulesQueryKey,
    queryFn: fetchUserModules,
    enabled,
    staleTime: 60_000,
  });
}

export function fetchUserProfiles() {
  return apiFetch<{ items: UserProfile[] }>("/api/user-profiles");
}

export function fetchUserProfileCatalog() {
  return apiFetch<{ items: NavModuleDefinition[] }>("/api/user-profiles/catalog");
}

export function useUserProfiles(enabled = true) {
  return useQuery({
    queryKey: userProfilesQueryKey,
    queryFn: fetchUserProfiles,
    enabled,
  });
}

export function useUserProfileCatalog(enabled = true) {
  return useQuery({
    queryKey: [...userProfilesQueryKey, "catalog"],
    queryFn: fetchUserProfileCatalog,
    enabled,
  });
}

export function useCreateUserProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; modules: NavModulesMap }) =>
      apiFetch<UserProfile>("/api/user-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userProfilesQueryKey });
    },
  });
}

export function useUpdateUserProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; data: { name?: string; description?: string; modules?: NavModulesMap } }) =>
      apiFetch<UserProfile>(`/api/user-profiles/${input.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userProfilesQueryKey });
      void queryClient.invalidateQueries({ queryKey: userModulesQueryKey });
    },
  });
}

export function useDeleteUserProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/user-profiles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userProfilesQueryKey });
    },
  });
}

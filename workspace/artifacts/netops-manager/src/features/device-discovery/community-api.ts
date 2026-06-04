import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CommunityLibraryItemAction,
  type CommunityLibraryItemMatchType,
  type CommunityLibraryItemOrigin,
  type CommunitySetOrigin,
  type CommunitySetStatus,
} from "@workspace/api-client-react";

export interface CommunityLibraryItem {
  id: number;
  deviceId: number;
  companyId: number;
  filterName: string;
  communityValue: string;
  matchType: CommunityLibraryItemMatchType;
  action: CommunityLibraryItemAction;
  indexOrder: number | null;
  origin: CommunityLibraryItemOrigin;
  description: string | null;
  tagsJson: { [key: string]: unknown } | null;
  isSystem: boolean;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunitySetMember {
  id: number | null;
  position: number;
  communityValue: string;
  linkedLibraryItemId: number | null;
  missingInLibrary: boolean;
  linkedFilterName: string;
  valueDescription: string | null;
}

export interface CommunitySet {
  id: number;
  deviceId: number;
  companyId: number;
  name: string;
  slug: string;
  vrpObjectName: string;
  origin: CommunitySetOrigin;
  discoveredMembersJson?: string[] | null;
  impliedConfigPreview?: string | null;
  description: string | null;
  status: CommunitySetStatus;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string;
  members: CommunitySetMember[];
  membersTotal: number;
  membersResolved: number;
  membersMissing: number;
}

export interface CommunitySetCompareResult {
  setAId: number;
  setAName: string;
  setAOrigin: CommunitySetOrigin;
  setBId: number;
  setBName: string;
  setBOrigin: CommunitySetOrigin;
  membersA: string[];
  membersB: string[];
  onlyInA: string[];
  onlyInB: string[];
  inBoth: string[];
  missingInA: string[];
  missingInB: string[];
  sameMembers: boolean;
}

export interface CommunityResyncResult {
  source: "running_config" | "live_ssh";
  configTextLength: number;
  libraryDiscovered: number;
  libraryInserted: number;
  libraryUpdated: number;
  librarySkippedManual: number;
  libraryDeactivated: number;
  setsDiscovered: number;
  setsInserted: number;
  setsSkippedAppCreated: number;
  setMembersInserted: number;
  setMembersMissingLibrary: number;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `API error: ${response.status} ${response.statusText}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const getCommunityLibraryQueryKey = (deviceId: number, q: string) => ["communityLibrary", deviceId, q] as const;
export const getCommunitySetsQueryKey = (deviceId: number) => ["communitySets", deviceId] as const;
export const getCommunitySetDetailsQueryKey = (deviceId: number, setId: number | null) => ["communitySet", deviceId, setId] as const;
export const getCommunitySetCompareQueryKey = (deviceId: number, leftSetId: number | null, rightSetId: number | null) =>
  ["communitySetCompare", deviceId, leftSetId, rightSetId] as const;
export const getCommunityAuditQueryKey = (deviceId: number) => ["communityAudit", deviceId] as const;

export function useCommunityLibraryItems(deviceId: number, q = "") {
  return useQuery({
    queryKey: getCommunityLibraryQueryKey(deviceId, q),
    queryFn: () => {
      const url = new URL(`/api/devices/${deviceId}/communities/library`, window.location.origin);
      if (q.trim()) url.searchParams.set("q", q.trim());
      return fetchJson<CommunityLibraryItem[]>(url.pathname + url.search);
    },
  });
}

export function useResyncCommunityLibrary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deviceId, source }: { deviceId: number; source: "backup" | "live" }) =>
      fetchJson<CommunityResyncResult>(
        source === "backup"
          ? `/api/devices/${deviceId}/communities/resync-from-config`
          : `/api/devices/${deviceId}/communities/resync-live`,
        { method: "POST" },
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["communityLibrary", variables.deviceId] });
      queryClient.invalidateQueries({ queryKey: ["communitySets", variables.deviceId] });
      queryClient.invalidateQueries({ queryKey: ["communityAudit", variables.deviceId] });
    },
  });
}

export function useCommunitySets(deviceId: number) {
  return useQuery({
    queryKey: getCommunitySetsQueryKey(deviceId),
    queryFn: () => fetchJson<CommunitySet[]>(`/api/devices/${deviceId}/community-sets`),
  });
}

export function useCommunitySetDetails(deviceId: number, setId: number | null) {
  return useQuery({
    queryKey: getCommunitySetDetailsQueryKey(deviceId, setId),
    queryFn: () => fetchJson<CommunitySet>(`/api/devices/${deviceId}/community-sets/${setId}`),
    enabled: !!setId,
  });
}

export function useCommunityPreview(deviceId: number, setId: number, enabled = false) {
  return useQuery({
    queryKey: ["communityPreview", deviceId, setId],
    queryFn: () => fetchJson(`/api/devices/${deviceId}/community-sets/${setId}/preview`, { method: "POST" }),
    enabled,
  });
}

export function useCompareCommunitySets(deviceId: number, leftSetId: number | null, rightSetId: number | null, enabled = true) {
  return useQuery({
    queryKey: getCommunitySetCompareQueryKey(deviceId, leftSetId, rightSetId),
    queryFn: () =>
      fetchJson<CommunitySetCompareResult>(`/api/devices/${deviceId}/community-sets/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leftSetId, rightSetId }),
      }),
    enabled: enabled && Boolean(leftSetId && rightSetId && leftSetId !== rightSetId),
  });
}

export function useApplyCommunitySet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      deviceId,
      setId,
      confirm,
      expectedCandidateSha256,
      acknowledgeMissingLibraryRefs,
    }: {
      deviceId: number;
      setId: number;
      confirm: boolean;
      expectedCandidateSha256: string;
      acknowledgeMissingLibraryRefs: boolean;
    }) =>
      fetchJson(`/api/devices/${deviceId}/community-sets/${setId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm,
          expectedCandidateSha256,
          acknowledgeMissingLibraryRefs,
        }),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: getCommunitySetsQueryKey(variables.deviceId) });
      queryClient.invalidateQueries({ queryKey: getCommunitySetDetailsQueryKey(variables.deviceId, variables.setId) });
    },
  });
}

export function useCreateCommunitySet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      deviceId,
      name,
      slug,
      vrpObjectName,
      description,
    }: {
      deviceId: number;
      name: string;
      slug?: string;
      vrpObjectName?: string;
      description?: string;
    }) =>
      fetchJson(`/api/devices/${deviceId}/community-sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, vrpObjectName, description }),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: getCommunitySetsQueryKey(variables.deviceId) });
    },
  });
}

export function useUpdateCommunitySet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      deviceId,
      setId,
      name,
      slug,
      vrpObjectName,
      description,
    }: {
      deviceId: number;
      setId: number;
      name?: string;
      slug?: string;
      vrpObjectName?: string;
      description?: string;
    }) =>
      fetchJson(`/api/devices/${deviceId}/community-sets/${setId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, vrpObjectName, description }),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: getCommunitySetsQueryKey(variables.deviceId) });
      queryClient.invalidateQueries({ queryKey: getCommunitySetDetailsQueryKey(variables.deviceId, variables.setId) });
    },
  });
}

export function useDeleteCommunitySet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      deviceId,
      setId,
    }: {
      deviceId: number;
      setId: number;
    }) =>
      fetchJson<void>(`/api/devices/${deviceId}/community-sets/${setId}`, { method: "DELETE" }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: getCommunitySetsQueryKey(variables.deviceId) });
    },
  });
}

export function useCommunityChangeAudit(deviceId: number) {
  return useQuery({
    queryKey: getCommunityAuditQueryKey(deviceId),
    queryFn: () => fetchJson(`/api/devices/${deviceId}/community-change-audit`),
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

async function fetchJson(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
  return response.json();
}

export function useCommunityLibraryItems(deviceId: number) {
  return useQuery({
    queryKey: ["communityLibrary", deviceId],
    queryFn: () => fetchJson(`/api/devices/${deviceId}/communities/library`),
  });
}

export function useCommunitySets(deviceId: number) {
  return useQuery({
    queryKey: ["communitySets", deviceId],
    queryFn: () => fetchJson(`/api/devices/${deviceId}/community-sets`),
  });
}

export function useCommunitySetDetails(deviceId: number, setId: number | null) {
  return useQuery({
    queryKey: ["communitySet", deviceId, setId],
    queryFn: () => fetchJson(`/api/devices/${deviceId}/community-sets/${setId}`),
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
      queryClient.invalidateQueries({
        queryKey: ["communitySets", variables.deviceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["communitySet", variables.deviceId, variables.setId],
      });
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
      queryClient.invalidateQueries({
        queryKey: ["communitySets", variables.deviceId],
      });
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
      queryClient.invalidateQueries({
        queryKey: ["communitySets", variables.deviceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["communitySet", variables.deviceId, variables.setId],
      });
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
      fetch(`/api/devices/${deviceId}/community-sets/${setId}`, { method: "DELETE" }).then((r) => {
        if (!r.ok) throw new Error(`API error: ${r.statusText}`);
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["communitySets", variables.deviceId],
      });
    },
  });
}

export function useCommunityChangeAudit(deviceId: number) {
  return useQuery({
    queryKey: ["communityAudit", deviceId],
    queryFn: () => fetchJson(`/api/devices/${deviceId}/community-change-audit`),
  });
}

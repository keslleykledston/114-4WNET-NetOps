import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  discoverDevice,
  getDeviceBgpPeerDetails,
  getDeviceDiscoverySnapshot,
  getGetDeviceDiscoverySnapshotQueryKey,
  getListDeviceBgpPeersQueryKey,
  listDeviceBgpPeers,
  type DeviceDiscoveryRequest,
  type NetopsBgpPeer,
} from "@workspace/api-client-react";

export type DiscoveryStatus = "full" | "partial" | "fallback" | "cached" | "failed";
export type DiscoverySource = "ssh_live" | "ssh_running_config" | "manual_upload" | "snmp_snapshot" | "local_db" | "netbox";
export type DiscoveryConfidence = "high" | "medium" | "low";

export interface DiscoverySnapshot {
  deviceId: number;
  discoveryRunId: string;
  status: DiscoveryStatus;
  contexts: string[];
  startedAt: string;
  finishedAt: string;
  sourceStatus: {
    ssh: "success" | "failed" | "skipped";
    snmp: "success" | "failed" | "skipped";
    cachedConfig: "used" | "available" | "missing" | "skipped";
  };
  persistedRunId?: number;
  persistedSnapshotId?: number | null;
  cachedFromPersistedSnapshot?: boolean;
  sourcesUsed: DiscoverySource[];
  interfaces: unknown[];
  bgpPeers: DiscoveryBgpPeer[];
  policies: unknown[];
  vrfs: unknown[];
  l2vpn: { l2vcs: unknown[]; vsis: unknown[] };
  warnings: Array<{ level: string; message: string; source: string }>;
  audit: Array<{ level: string; message: string; source: string }>;
}

export type DiscoveryBgpPeer = Omit<NetopsBgpPeer, "source"> & {
  category: NetopsBgpPeer["role"];
  primaryDirection: "import" | "export" | "internal";
  largeReceivedRoutes: boolean;
  largeAdvertisedRoutes: boolean;
  autoLoadRoutes: false;
  requiresExplicitRouteSearch: boolean;
  source: DiscoverySource;
  confidence: DiscoveryConfidence;
  evidence?: string;
};

export interface DiscoveryBgpPeerDetails {
  peer: DiscoveryBgpPeer;
  category: NetopsBgpPeer["role"];
  primaryDirection: "import" | "export" | "internal";
  importPolicy: string | null;
  exportPolicy: string | null;
  primaryPolicy: string | null;
  secondaryPolicy: string | null;
  routePolicyNodes: Array<{ sequence: number | null; action: string | null; matches: string[]; applies: string[] }>;
  referencedIpPrefixes: Array<{ name: string; entries: unknown[]; source: DiscoverySource; confidence: DiscoveryConfidence; evidence?: string }>;
  referencedCommunityFilters: Array<{ name: string; entries: unknown[]; source: DiscoverySource; confidence: DiscoveryConfidence; evidence?: string }>;
  referencedCommunityLists: Array<{ name: string; entries: unknown[]; source: DiscoverySource; confidence: DiscoveryConfidence; evidence?: string }>;
  routeCounters: {
    receivedRoutes: number | null;
    advertisedRoutes: number | null;
    largeReceivedRoutes: boolean;
    largeAdvertisedRoutes: boolean;
    autoLoadRoutes: false;
    requiresExplicitRouteSearch: boolean;
  };
  operationalState: NetopsBgpPeer["state"];
  protections: { noFullDumpAutomatic: true; sampleLimit: number; maxAutoRoutes: number };
  evidence: Array<{ source: DiscoverySource; confidence: DiscoveryConfidence; evidence?: string }>;
}

const DEFAULT_DISCOVERY_REQUEST: DeviceDiscoveryRequest = {
  contexts: ["interfaces", "bgp", "l2vpn", "policies", "vrfs"],
  preferLiveSsh: true,
  allowSnmpFallback: true,
  useCachedConfig: true,
};

export function useDiscoverySnapshot(deviceId: number) {
  return useQuery({
    queryKey: getGetDeviceDiscoverySnapshotQueryKey(deviceId),
    queryFn: async () => getDeviceDiscoverySnapshot(deviceId) as Promise<DiscoverySnapshot | null>,
    enabled: !!deviceId,
  });
}

export function useRunDiscovery(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => discoverDevice(deviceId, DEFAULT_DISCOVERY_REQUEST) as Promise<DiscoverySnapshot>,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetDeviceDiscoverySnapshotQueryKey(deviceId) }),
        queryClient.invalidateQueries({ queryKey: getListDeviceBgpPeersQueryKey(deviceId) }),
      ]);
    },
  });
}

export function useDiscoveryBgpPeers(deviceId: number, category?: string) {
  return useQuery({
    queryKey: getListDeviceBgpPeersQueryKey(deviceId, category ? { category: category as never } : undefined),
    queryFn: async () => listDeviceBgpPeers(deviceId, category ? { category: category as never } : undefined) as Promise<DiscoveryBgpPeer[]>,
    enabled: !!deviceId,
  });
}

export function useDiscoveryBgpPeerDetails(deviceId: number, peerIp: string, enabled: boolean) {
  return useQuery({
    queryKey: ["device-discovery-bgp-peer-details", deviceId, peerIp],
    queryFn: async () => getDeviceBgpPeerDetails(deviceId, peerIp) as unknown as Promise<DiscoveryBgpPeerDetails>,
    enabled: enabled && !!deviceId && !!peerIp,
  });
}

export function useDiscoveryBgpPeerRoutes(
  deviceId: number,
  peerIp: string,
  direction: "received" | "advertised",
  page: number = 1,
  limit: number = 200,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["device-discovery-bgp-peer-routes", deviceId, peerIp, direction, page, limit],
    queryFn: async () => {
      const response = await fetch(
        `/api/devices/${deviceId}/bgp/peers/${encodeURIComponent(peerIp)}/routes/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ direction, limit, page }),
        }
      );
      if (!response.ok) throw new Error("Failed to fetch routes");
      return response.json();
    },
    enabled: enabled && !!deviceId && !!peerIp,
  });
}

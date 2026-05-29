import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDeviceDiscoverySnapshotQueryKey,
  getGetNetopsDeviceSummaryQueryKey,
  getListDeviceBgpPeersQueryKey,
  getListNetopsDeviceBgpPeersQueryKey,
  getListNetopsDeviceCommunitiesQueryKey,
  getListNetopsDeviceFiltersQueryKey,
  getListNetopsDeviceInterfacesQueryKey,
  getListNetopsDeviceLogsQueryKey,
  useDiscoverDevice,
  type DeviceDiscoveryRequest,
} from "@workspace/api-client-react";
import type { Device } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TerminalSquare } from "lucide-react";
import { l2CircuitsQueryKey } from "@/features/l2-circuits/l2-circuits-api";

const SSH_DISCOVERY_REQUEST: DeviceDiscoveryRequest = {
  contexts: ["interfaces", "bgp", "l2vpn", "policies", "vrfs"],
  preferLiveSsh: true,
  allowSnmpFallback: false,
  useCachedConfig: true,
};

interface CollectSshButtonProps {
  device: Device;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm";
}

function buildSummaryMessage(result: {
  status: string;
  sourceStatus?: { ssh?: string };
  interfaces?: unknown[];
  bgpPeers?: unknown[];
  policies?: unknown[];
  communities?: unknown[];
  communityLists?: unknown[];
  l2vpn?: { l2vcs?: unknown[]; vsis?: unknown[] };
  warnings?: Array<{ level: string; message: string }>;
}) {
  const sshOk = result.sourceStatus?.ssh === "success";
  const l2Count = (result.l2vpn?.l2vcs?.length ?? 0) + (result.l2vpn?.vsis?.length ?? 0);
  const filters = (result.policies?.length ?? 0) + (result.communities?.length ?? 0) + (result.communityLists?.length ?? 0);

  if (!sshOk) {
    const warning = result.warnings?.find((item) => item.level === "error" || item.level === "warning");
    return warning?.message ?? "SSH discovery failed or returned no data.";
  }

  return [
    `${result.interfaces?.length ?? 0} interfaces`,
    `${result.bgpPeers?.length ?? 0} BGP peers`,
    `${filters} policy/community objects`,
    `${l2Count} L2 entries`,
    `status ${result.status}`,
  ].join(" · ");
}

export function CollectSshButton({ device, variant = "outline", size = "sm" }: CollectSshButtonProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const discover = useDiscoverDevice();

  const invalidateDeviceQueries = () => {
    void queryClient.invalidateQueries({ queryKey: getGetNetopsDeviceSummaryQueryKey(device.id) });
    void queryClient.invalidateQueries({ queryKey: getListNetopsDeviceInterfacesQueryKey(device.id) });
    void queryClient.invalidateQueries({ queryKey: getListNetopsDeviceBgpPeersQueryKey(device.id) });
    void queryClient.invalidateQueries({ queryKey: getListNetopsDeviceFiltersQueryKey(device.id) });
    void queryClient.invalidateQueries({ queryKey: getListNetopsDeviceCommunitiesQueryKey(device.id) });
    void queryClient.invalidateQueries({ queryKey: getListNetopsDeviceLogsQueryKey(device.id) });
    void queryClient.invalidateQueries({ queryKey: getGetDeviceDiscoverySnapshotQueryKey(device.id) });
    void queryClient.invalidateQueries({ queryKey: getListDeviceBgpPeersQueryKey(device.id) });
    void queryClient.invalidateQueries({ queryKey: l2CircuitsQueryKey(device.id) });
    void queryClient.invalidateQueries({ queryKey: l2CircuitsQueryKey() });
  };

  const handleCollect = () => {
    discover.mutate(
      { id: device.id, data: SSH_DISCOVERY_REQUEST },
      {
        onSuccess: (result) => {
          invalidateDeviceQueries();

          const sshOk = result.sourceStatus?.ssh === "success";
          toast({
            title: sshOk ? "Coleta SSH concluida" : "Coleta SSH com avisos",
            description: buildSummaryMessage(result),
            variant: sshOk ? "default" : "destructive",
          });
        },
        onError: (error) => {
          toast({
            title: "Falha na coleta SSH",
            description: error instanceof Error ? error.message : "Nao foi possivel executar discovery SSH read-only.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleCollect}
      disabled={discover.isPending}
    >
      <TerminalSquare className="mr-2 h-4 w-4" />
      {discover.isPending ? "Coletando SSH..." : "Coletar via SSH"}
    </Button>
  );
}

import { useQueryClient } from "@tanstack/react-query";
import {
  collectNetopsDeviceReadOnly,
  getGetDeviceDiscoverySnapshotQueryKey,
  getListDeviceBgpPeersQueryKey,
  getGetNetopsDeviceSummaryQueryKey,
  getListNetopsDeviceBgpPeersQueryKey,
  getListNetopsDeviceInterfacesQueryKey,
  getListNetopsDeviceLogsQueryKey,
  useCollectNetopsDeviceReadOnly,
} from "@workspace/api-client-react";
import type { Device } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RadioTower } from "lucide-react";

interface CollectSnmpButtonProps {
  device: Device;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm";
}

export function CollectSnmpButton({ device, variant = "outline", size = "sm" }: CollectSnmpButtonProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const collect = useCollectNetopsDeviceReadOnly({
    mutation: {
      mutationFn: async ({ id }) => collectNetopsDeviceReadOnly(id, {
        signal: AbortSignal.timeout(300_000),
      }),
    },
  });

  const handleCollect = () => {
    collect.mutate(
      { id: device.id },
      {
        onSuccess: (result) => {
          void queryClient.invalidateQueries({ queryKey: getGetNetopsDeviceSummaryQueryKey(device.id) });
          void queryClient.invalidateQueries({ queryKey: getListNetopsDeviceInterfacesQueryKey(device.id) });
          void queryClient.invalidateQueries({ queryKey: getListNetopsDeviceBgpPeersQueryKey(device.id) });
          void queryClient.invalidateQueries({ queryKey: getListNetopsDeviceLogsQueryKey(device.id) });
          void queryClient.invalidateQueries({ queryKey: getGetDeviceDiscoverySnapshotQueryKey(device.id) });
          void queryClient.invalidateQueries({ queryKey: getListDeviceBgpPeersQueryKey(device.id) });

          if (result.executed) {
            toast({
              title: result.status === "ready" ? "Coleta SNMP concluida" : "Coleta SNMP com avisos",
              description: result.message,
            });
            return;
          }

          toast({
            title: "Coleta SNMP nao executada",
            description: result.message,
            variant: "destructive",
          });
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : "Nao foi possivel efetuar a coleta read-only.";
          const isTimeout = /timeout|aborted/i.test(message);
          toast({
            title: "Falha na coleta SNMP",
            description: isTimeout
              ? "A coleta excedeu 5 minutos (walks SNMP via connector). Tente novamente ou aguarde o poller automatico."
              : message,
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
      disabled={collect.isPending}
    >
      <RadioTower className="mr-2 h-4 w-4" />
      {collect.isPending ? "Coletando..." : "Coletar via SNMP"}
    </Button>
  );
}

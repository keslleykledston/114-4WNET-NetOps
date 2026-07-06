import { useQueryClient } from "@tanstack/react-query";
import {
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
import { useTranslation } from "@/i18n";

interface CollectSnmpButtonProps {
  device: Device;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm";
}

export function CollectSnmpButton({ device, variant = "outline", size = "sm" }: CollectSnmpButtonProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const collect = useCollectNetopsDeviceReadOnly();

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
              title: result.status === "ready" ? t("deviceInventory.collectSnmp.toastSuccess") : t("deviceInventory.collectSnmp.toastWarnings"),
              description: result.message,
            });
            return;
          }

          toast({
            title: t("deviceInventory.collectSnmp.toastNotExecuted"),
            description: result.message,
            variant: "destructive",
          });
        },
        onError: () => {
          toast({
            title: t("deviceInventory.collectSnmp.toastFailed"),
            description: t("deviceInventory.collectSnmp.toastFailedDesc"),
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
      {collect.isPending ? t("deviceInventory.collectSnmp.collecting") : t("deviceInventory.collectSnmp.button")}
    </Button>
  );
}

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListDevices } from "@workspace/api-client-react";
import type { DeviceData } from "@/lib/network-map/types";
import { inventoryNodeId, mapInventoryDeviceToMapNode } from "@/lib/network-map/inventory-bridge";
import { useTranslation } from "@/i18n";

export function EditMapDeviceDialog({
  open,
  onOpenChange,
  device,
  mapDevices,
  onReplace,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: DeviceData | null;
  mapDevices: DeviceData[];
  onReplace: (oldDevice: DeviceData, newDevice: DeviceData) => void;
  onDelete: (device: DeviceData) => void;
}) {
  const { t } = useTranslation();
  const { data: inventoryDevices = [], isLoading } = useListDevices();
  const [deviceId, setDeviceId] = useState<string>("");

  useEffect(() => {
    if (!open || !device) return;
    const invId = device.id.startsWith("device:") ? device.id.slice("device:".length) : "";
    setDeviceId(invId && !device.id.includes("pending") ? invId : "");
  }, [open, device]);

  if (!device) return null;

  const onMapIds = new Set(mapDevices.map((d) => d.id));
  const sorted = [...inventoryDevices].sort((a, b) => a.hostname.localeCompare(b.hostname));

  const handleReplace = () => {
    const inv = sorted.find((d) => String(d.id) === deviceId);
    if (!inv) return;
    const nodeId = inventoryNodeId(inv.id);
    if (onMapIds.has(nodeId) && nodeId !== device.id) return;
    onReplace(device, mapInventoryDeviceToMapNode(inv));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("networkMap.editDevice.title")}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {t("networkMap.editDevice.description", { name: device.name })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>{t("networkMap.editDevice.replaceLabel")}</Label>
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger className="border-zinc-800 bg-zinc-900">
                <SelectValue
                  placeholder={
                    isLoading
                      ? `${t("common.loading")}...`
                      : t("networkMap.editDevice.selectDevicePlaceholder")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {sorted.map((d) => {
                  const nodeId = inventoryNodeId(d.id);
                  const taken = onMapIds.has(nodeId) && nodeId !== device.id;
                  return (
                    <SelectItem key={d.id} value={String(d.id)} disabled={taken}>
                      {d.hostname}
                      <span className="ml-1 text-zinc-500">({d.site})</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="destructive"
            className="w-full sm:w-auto"
            onClick={() => {
              onDelete(device);
              onOpenChange(false);
            }}
          >
            {t("networkMap.editDevice.removeFromMap")}
          </Button>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" disabled={!deviceId} onClick={handleReplace}>
              {t("networkMap.editDevice.replace")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

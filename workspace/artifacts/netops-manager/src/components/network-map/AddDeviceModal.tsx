import { useEffect, useMemo, useState } from "react";
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

export function AddDeviceModal({
  open,
  onOpenChange,
  mapDevices,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mapDevices: DeviceData[];
  onConfirm: (device: DeviceData, connectToNeighborId?: string) => void;
}) {
  const { t } = useTranslation();
  const { data: inventoryDevices = [], isLoading } = useListDevices();
  const [deviceId, setDeviceId] = useState<string>("");
  const [neighborId, setNeighborId] = useState<string>("none");

  useEffect(() => {
    if (!open) return;
    setDeviceId("");
    setNeighborId("none");
  }, [open]);

  const sortedInventory = useMemo(
    () => [...inventoryDevices].sort((a, b) => a.hostname.localeCompare(b.hostname)),
    [inventoryDevices],
  );

  const onMapIds = useMemo(() => new Set(mapDevices.map((d) => d.id)), [mapDevices]);
  const neighborOptions = useMemo(
    () => mapDevices.filter((d) => !d.id.startsWith("device:pending-")),
    [mapDevices],
  );

  const selectedInventory = sortedInventory.find((d) => String(d.id) === deviceId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("networkMap.addDevice.title")}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {t("networkMap.addDevice.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>{t("networkMap.addDevice.inventoryDeviceLabel")}</Label>
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger className="border-zinc-800 bg-zinc-900">
                <SelectValue
                  placeholder={
                    isLoading
                      ? `${t("common.loading")}...`
                      : t("networkMap.addDevice.selectDevicePlaceholder")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {sortedInventory.map((d) => {
                  const nodeId = inventoryNodeId(d.id);
                  const onMap = onMapIds.has(nodeId);
                  return (
                    <SelectItem key={d.id} value={String(d.id)} disabled={onMap}>
                      {d.hostname}
                      <span className="ml-1 text-zinc-500">({d.site})</span>
                      {onMap ? t("networkMap.addDevice.alreadyOnMap") : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("networkMap.addDevice.connectNeighborLabel")}</Label>
            <Select value={neighborId} onValueChange={setNeighborId}>
              <SelectTrigger className="border-zinc-800 bg-zinc-900">
                <SelectValue placeholder={t("networkMap.addDevice.none")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("networkMap.addDevice.none")}</SelectItem>
                {neighborOptions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    <span className="ml-1 text-zinc-500">({d.site})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!selectedInventory}
            onClick={() => {
              if (!selectedInventory) return;
              const device = mapInventoryDeviceToMapNode(selectedInventory);
              onConfirm(device, neighborId === "none" ? undefined : neighborId);
              onOpenChange(false);
            }}
          >
            {t("networkMap.addDevice.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

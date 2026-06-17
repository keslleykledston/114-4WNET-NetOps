import { useMemo, useState } from "react";
import { useListDevices } from "@workspace/api-client-react";
import { OperationalLogsPanel } from "@/features/device-inventory/operational-logs-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity } from "lucide-react";

export default function AuditOperationalLogsPage() {
  const { data: devices, isLoading } = useListDevices();
  const [deviceId, setDeviceId] = useState<string>("");

  const sortedDevices = useMemo(
    () => [...(devices ?? [])].sort((left, right) => left.hostname.localeCompare(right.hostname)),
    [devices],
  );

  const selectedDevice = useMemo(() => {
    if (!sortedDevices.length) return null;
    const parsedId = Number(deviceId);
    if (deviceId && Number.isFinite(parsedId)) {
      return sortedDevices.find((device) => device.id === parsedId) ?? sortedDevices[0];
    }
    return sortedDevices[0];
  }, [deviceId, sortedDevices]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operational Logs</h1>
        <p className="mt-1 text-muted-foreground">
          Device-scoped operational events from discovery, SNMP, and SSH collections.
        </p>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="p-6">
          <div className="grid gap-4 md:grid-cols-[minmax(220px,360px)]">
            <div className="space-y-2">
              <label className="text-sm font-medium">Device</label>
              <Select
                value={selectedDevice ? String(selectedDevice.id) : undefined}
                onValueChange={setDeviceId}
                disabled={isLoading || !sortedDevices.length}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={isLoading ? "Loading devices..." : "Select a device"} />
                </SelectTrigger>
                <SelectContent>
                  {sortedDevices.map((device) => (
                    <SelectItem key={device.id} value={String(device.id)}>
                      {device.hostname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading devices...</CardContent>
        </Card>
      ) : !selectedDevice ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" />
            No devices available. Add a device to view operational logs.
          </CardContent>
        </Card>
      ) : (
        <OperationalLogsPanel device={selectedDevice} />
      )}
    </div>
  );
}

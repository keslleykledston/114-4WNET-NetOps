import { useState } from "react";
import { 
  useListCollectedConfigs, getListCollectedConfigsQueryKey,
  useCollectDeviceConfig,
  useListDevices
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DownloadCloud, Terminal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ConfigCollection() {
  const { data: configs, isLoading } = useListCollectedConfigs();
  const { data: devices } = useListDevices();
  const collectConfig = useCollectDeviceConfig();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedDevice, setSelectedDevice] = useState<string>("");

  const handleCollect = () => {
    if (!selectedDevice) return;
    toast({ title: "Initiating collection..." });
    collectConfig.mutate({ data: { deviceId: parseInt(selectedDevice) } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCollectedConfigsQueryKey() });
        toast({ title: "Config collected successfully" });
      },
      onError: (err: any) => {
        toast({ title: "Collection failed", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Config Collection</h1>
          <p className="text-muted-foreground mt-1">Retrieve and parse device configurations</p>
        </div>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="p-6">
          <div className="flex items-end gap-4">
            <div className="space-y-2 flex-1 max-w-md">
              <label className="text-sm font-medium">Target Device</label>
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger className="bg-background"><SelectValue placeholder="Select a device" /></SelectTrigger>
                <SelectContent>
                  {devices?.map(d => (
                    <SelectItem key={d.id} value={d.id.toString()}>{d.hostname} ({d.ipAddress})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCollect} disabled={!selectedDevice || collectConfig.isPending}>
              <DownloadCloud className="h-4 w-4 mr-2" />
              {collectConfig.isPending ? "Collecting..." : "Collect Now"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Collections</CardTitle>
        </CardHeader>
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Collected At</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : configs?.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No collected configs.</TableCell></TableRow>
              ) : (
                configs?.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.deviceHostname}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(c.collectedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      {c.rawConfig ? `${(c.rawConfig.length / 1024).toFixed(1)} KB` : '0 KB'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        <Terminal className="h-4 w-4 mr-2" />
                        View Raw
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
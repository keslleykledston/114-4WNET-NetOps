import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListDevices } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, History, Server } from "lucide-react";

type BgpRemovalPeer = {
  peerIp?: string;
  remoteAs?: number | null;
  state?: string | null;
  role?: string | null;
  description?: string | null;
  name?: string | null;
  vrf?: string | null;
  removedAt?: string | null;
  removedReason?: string | null;
  collectionState?: string | null;
  source?: string | null;
};

type BgpRemovalEvent = {
  id: number;
  deviceId: number;
  deviceHostname: string | null;
  deviceIpAddress: string | null;
  previousSnapshotId: number | null;
  currentSnapshotId: number | null;
  collector: string;
  removedPeers: BgpRemovalPeer[];
  removedCount: number;
  createdAt: string;
};

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" } });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function buildQuery(deviceId: string, limit: number): string {
  const params = new URLSearchParams();
  if (deviceId !== "all") params.set("deviceId", deviceId);
  params.set("limit", String(limit));
  return `/api/bgp-peer-removals?${params.toString()}`;
}

export default function BgpRemovalsPage() {
  const [deviceId, setDeviceId] = useState("all");
  const [selected, setSelected] = useState<BgpRemovalEvent | null>(null);
  const limit = 100;

  const queryKey = useMemo(() => ["bgp-peer-removals", deviceId, limit] as const, [deviceId]);
  const queryPath = useMemo(() => buildQuery(deviceId, limit), [deviceId]);

  const { data: devices } = useListDevices();
  const { data: rows, isLoading, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => apiFetch<BgpRemovalEvent[]>(queryPath),
  });

  const totalEvents = rows?.length ?? 0;
  const totalRemovedPeers = rows?.reduce((sum, row) => sum + row.removedCount, 0) ?? 0;
  const latestEvent = rows?.[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">BGP Removals</h1>
          <p className="mt-1 text-muted-foreground">
            Historical removals captured from SNMP collections. Active peers are kept separate from removal history.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          <History className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Removal Events</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEvents}</div>
            <p className="text-xs text-muted-foreground mt-1">Within current filters</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Removed Peers</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">{totalRemovedPeers}</div>
            <p className="text-xs text-muted-foreground mt-1">Recorded in history only</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Latest Event</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold">{latestEvent ? formatDate(latestEvent.createdAt) : "No events"}</div>
            <p className="text-xs text-muted-foreground mt-1">{latestEvent?.deviceHostname ?? "Awaiting history"}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="p-6">
          <div className="grid gap-4 md:grid-cols-[minmax(220px,360px)]">
            <div className="space-y-2">
              <label className="text-sm font-medium">Device</label>
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="All devices" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All devices</SelectItem>
                  {devices?.map((device) => (
                    <SelectItem key={device.id} value={device.id.toString()}>
                      {device.hostname} ({device.ipAddress})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Removal History</CardTitle>
        </CardHeader>
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Collector</TableHead>
                <TableHead className="text-right">Removed</TableHead>
                <TableHead>Peers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : !rows?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No removal history found.</TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelected(row)}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(row.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{row.deviceHostname ?? `Device #${row.deviceId}`}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{row.deviceIpAddress ?? "—"}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.collector}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{row.removedCount}</TableCell>
                  <TableCell className="max-w-[420px] truncate text-sm text-muted-foreground">
                    {row.removedPeers.slice(0, 3).map((peer) => peer.peerIp ?? "unknown").join(", ")}
                    {row.removedPeers.length > 3 ? ` (+${row.removedPeers.length - 3})` : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Removal Event Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <Detail label="Date" value={formatDate(selected.createdAt)} />
                  <Detail label="Device" value={selected.deviceHostname ?? `Device #${selected.deviceId}`} />
                  <Detail label="IP" value={selected.deviceIpAddress ?? "—"} />
                  <Detail label="Collector" value={selected.collector} />
                  <Detail label="Removed Peers" value={String(selected.removedCount)} />
                  <Detail label="Current Snapshot" value={selected.currentSnapshotId?.toString() ?? "—"} />
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Removed Peers</div>
                  <div className="space-y-2">
                    {selected.removedPeers.map((peer) => (
                      <div key={`${peer.peerIp ?? "unknown"}-${peer.removedAt ?? selected.createdAt}`} className="rounded-md border bg-muted/20 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-semibold">{peer.peerIp ?? "unknown"}</span>
                          <Badge variant="outline">{peer.collectionState ?? "removed"}</Badge>
                          {peer.role ? <Badge variant="secondary">{peer.role}</Badge> : null}
                        </div>
                        <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                          <div>AS: {peer.remoteAs ?? "—"}</div>
                          <div>VRF: {peer.vrf ?? "default"}</div>
                          <div>State: {peer.state ?? "—"}</div>
                          <div>Reason: {peer.removedReason ?? "missing in latest SNMP collection"}</div>
                        </div>
                        {peer.description || peer.name ? (
                          <div className="mt-2 text-xs text-muted-foreground">
                            {peer.description ?? peer.name}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm">{value}</div>
    </div>
  );
}

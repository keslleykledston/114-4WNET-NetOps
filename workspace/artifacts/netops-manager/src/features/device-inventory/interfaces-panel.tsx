import { useListNetopsDeviceInterfaces } from "@workspace/api-client-react";
import type { Device } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GitBranch } from "lucide-react";
import { CollectSnmpButton } from "./collect-snmp-button";

export function InterfacesPanel({ device }: { device: Device }) {
  const { data: interfaces, isLoading, isError } = useListNetopsDeviceInterfaces(device.id);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <GitBranch className="h-5 w-5" />
          Interfaces
        </CardTitle>
        <CollectSnmpButton device={device} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load interfaces.
          </div>
        ) : !interfaces?.length ? (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No interfaces found for {device.hostname}.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Oper</TableHead>
                <TableHead>VLAN</TableHead>
                <TableHead>VRF</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interfaces.map((iface) => (
                <TableRow key={`${iface.name}-${iface.vlan ?? "none"}`}>
                  <TableCell className="font-mono">{iface.name}</TableCell>
                  <TableCell>{iface.description ?? "-"}</TableCell>
                  <TableCell><Badge variant="outline">{iface.adminStatus}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{iface.operStatus}</Badge></TableCell>
                  <TableCell>{iface.vlan ?? "-"}</TableCell>
                  <TableCell>{iface.vrf ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{iface.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

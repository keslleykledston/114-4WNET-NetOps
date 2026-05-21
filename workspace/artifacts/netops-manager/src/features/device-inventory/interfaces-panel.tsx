import { useState, useEffect } from "react";
import { useListNetopsDeviceInterfaces, useGetNetopsDeviceSummary } from "@workspace/api-client-react";
import type { Device } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GitBranch } from "lucide-react";
import { CollectSnmpButton } from "./collect-snmp-button";
import { getInterfaceFilterOptions, getInterfaceKindLabel } from "../netops/labels";

export function InterfacesPanel({ device }: { device: Device }) {
  const { data: interfaces, isLoading, isError } = useListNetopsDeviceInterfaces(device.id);
  const { data: summary } = useGetNetopsDeviceSummary(device.id);
  const [selectedKind, setSelectedKind] = useState<string | "all">("all");

  useEffect(() => {
    const storageKey = `interfaces-filter-${device.id}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      setSelectedKind(stored);
    }
  }, [device.id]);

  const handleKindChange = (value: string) => {
    setSelectedKind(value);
    localStorage.setItem(`interfaces-filter-${device.id}`, value);
  };

  const filterOptions = getInterfaceFilterOptions(summary?.deviceKind);
  const filteredInterfaces = interfaces
    ? selectedKind === "all"
      ? interfaces
      : interfaces.filter((iface) => iface.kind === selectedKind)
    : undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <GitBranch className="h-5 w-5" />
          Interfaces
        </CardTitle>
        <CollectSnmpButton device={device} />
      </CardHeader>
      <CardContent className="space-y-4">
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
          <>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Filtrar por tipo:</label>
              <Select value={selectedKind} onValueChange={handleKindChange}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filterOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filteredInterfaces && filteredInterfaces.length !== interfaces.length && (
                <span className="text-sm text-muted-foreground">
                  {filteredInterfaces.length} de {interfaces.length}
                </span>
              )}
            </div>

            {filteredInterfaces && filteredInterfaces.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                No interfaces match selected filter.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Oper</TableHead>
                    <TableHead>VLAN/Subinterface</TableHead>
                    <TableHead>Pai</TableHead>
                    <TableHead>Origem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInterfaces?.map((iface) => (
                    <TableRow key={`${iface.name}-${iface.vlan ?? "none"}`}>
                  <TableCell className="font-mono">{iface.name}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {iface.description && (
                      <div className="text-sm">{iface.description}</div>
                    )}
                    {iface.rawDescr && iface.description !== iface.rawDescr && (
                      <div className="text-xs text-muted-foreground">{iface.rawDescr}</div>
                    )}
                    {!iface.description && !iface.rawDescr && <span>-</span>}
                  </TableCell>
                  <TableCell>
                    {iface.kind ? getInterfaceKindLabel(iface.kind) : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{iface.adminStatus}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{iface.operStatus}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {iface.parentInterface && iface.vlanId ? (
                      <div>
                        <div>{iface.parentInterface}.{iface.vlanId}</div>
                        {iface.encapsulation && (
                          <div className="text-xs text-muted-foreground">{iface.encapsulation}</div>
                        )}
                      </div>
                    ) : iface.vlanId ? (
                      <div>{iface.vlanId}</div>
                    ) : iface.parentInterface ? (
                      <div>{iface.parentInterface}</div>
                    ) : (
                      <span>-</span>
                    )}
                  </TableCell>
                  <TableCell>{iface.parentInterface || "-"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {iface.source}
                  </TableCell>
                </TableRow>
              ))}
              </TableBody>
            </Table>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

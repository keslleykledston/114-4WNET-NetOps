import { useMemo, useState } from "react";
import { useListDevices } from "@workspace/api-client-react";
import { BgpPanel } from "@/features/bgp/bgp-panel";
import { FiltersPanel } from "@/features/bgp/filters-panel";
import { CommunitiesPanel } from "@/features/communities/communities-placeholder-panel";
import { InterfacesPanel } from "@/features/device-inventory/interfaces-panel";
import { OperationalLogsPanel } from "@/features/device-inventory/operational-logs-panel";
import { OperationalSummary } from "@/features/device-inventory/operational-summary";
import { NetopsTree, type NetopsTreeSelection, viewLabel } from "@/features/netops-tree";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export default function NetopsOperations() {
  const { data: devices, isLoading } = useListDevices();
  const sortedDevices = useMemo(
    () => [...(devices ?? [])].sort((left, right) => left.hostname.localeCompare(right.hostname, "pt", { sensitivity: "base" })),
    [devices],
  );
  const [selection, setSelection] = useState<NetopsTreeSelection | null>(null);

  const activeSelection = selection ?? (sortedDevices[0] ? { device: sortedDevices[0], view: "device" as const } : null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">NetOps Operations</h1>
        <p className="mt-1 text-muted-foreground">Device tree and operational views</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Cliente / Empresa
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="p-3">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-4/5" />
                <Skeleton className="h-8 w-3/5" />
              </div>
            ) : (
              <NetopsTree devices={sortedDevices} selected={activeSelection} onSelect={setSelection} />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {!activeSelection ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                No device selected.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">{activeSelection.device.site || "Sem cliente"}</div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {activeSelection.device.hostname} / {viewLabel(activeSelection.view)}
                  </h2>
                </div>
              </div>

              {activeSelection.view === "device" && <OperationalSummary device={activeSelection.device} />}

              {activeSelection.view === "interfaces" && (
                <InterfacesPanel device={activeSelection.device} />
              )}

              {activeSelection.view === "bgp" && (
                <BgpPanel device={activeSelection.device} title="BGP" />
              )}

              {activeSelection.view === "bgp-providers" && (
                <BgpPanel device={activeSelection.device} title="BGP Operadoras" role="provider" />
              )}

              {activeSelection.view === "bgp-customers" && (
                <BgpPanel device={activeSelection.device} title="BGP Clientes" role="customer" />
              )}

              {activeSelection.view === "bgp-cdn" && (
                <BgpPanel device={activeSelection.device} title="BGP CDN" role="cdn" />
              )}

              {activeSelection.view === "bgp-ix" && (
                <BgpPanel device={activeSelection.device} title="BGP IX" role="ix" />
              )}

              {activeSelection.view === "bgp-cdn-ix" && (
                <BgpPanel device={activeSelection.device} title="BGP CDN/IX" role="cdn_ix" />
              )}

              {activeSelection.view === "bgp-ibgp" && (
                <BgpPanel device={activeSelection.device} title="BGP iBGP" role="ibgp" />
              )}

              {activeSelection.view === "filters" && (
                <FiltersPanel device={activeSelection.device} />
              )}

              {activeSelection.view === "communities" && (
                <CommunitiesPanel device={activeSelection.device} />
              )}

              <OperationalLogsPanel device={activeSelection.device} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

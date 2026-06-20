import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Filter, Network, Eye } from "lucide-react";
import { VsiVplsDetailSheet } from "@/features/vsi-vpls/vsi-vpls-detail-sheet";
import { useVsiVplsList, type VsiVplsServiceSummary } from "@/features/vsi-vpls/vsi-vpls-api";

const STATUS_OPTIONS: Array<VsiVplsServiceSummary["status"] | "ALL"> = ["ALL", "UP", "DEGRADED", "DOWN", "CONFIG_ONLY", "UNKNOWN"];

export default function VsiVplsPage() {
  const [tenantId, setTenantId] = useState("");
  const [vsId, setVsId] = useState("");
  const [name, setName] = useState("");
  const [siteId, setSiteId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("ALL");
  const [hasAlarm, setHasAlarm] = useState("ALL");
  const [hasDivergence, setHasDivergence] = useState("ALL");
  const [detailId, setDetailId] = useState<string | null>(null);

  const filters = useMemo(() => ({
    tenant_id: tenantId ? Number(tenantId) : undefined,
    vs_id: vsId || undefined,
    name: name || undefined,
    site_id: siteId || undefined,
    device_id: deviceId ? Number(deviceId) : undefined,
    status: status === "ALL" ? undefined : status,
    has_alarm: hasAlarm === "ALL" ? undefined : hasAlarm === "true",
    has_divergence: hasDivergence === "ALL" ? undefined : hasDivergence === "true",
  }), [tenantId, vsId, name, siteId, deviceId, status, hasAlarm, hasDivergence]);

  const { data, isLoading, isError, error } = useVsiVplsList(filters);
  const services = data?.services ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" />
            VSI / VPLS
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Biblioteca de serviços multiponto descobertos no Tenant.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{data?.total ?? 0} serviços</Badge>
          <Badge variant="secondary">{services.filter((item) => item.status === "UP").length} UP</Badge>
          <Badge variant="secondary">{services.filter((item) => item.status === "DEGRADED").length} DEGRADED</Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
          <CardDescription>Use filtros leves. O agrupamento principal é tenant + VS-ID.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input placeholder="Tenant ID" value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
          <Input placeholder="VS-ID" value={vsId} onChange={(e) => setVsId(e.target.value)} />
          <Input placeholder="Nome da VSI" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Site" value={siteId} onChange={(e) => setSiteId(e.target.value)} />
          <Input placeholder="Device ID" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} />
          <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={hasAlarm} onValueChange={setHasAlarm}>
            <SelectTrigger><SelectValue placeholder="Com alarme" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Com alarme: todos</SelectItem>
              <SelectItem value="true">Com alarme</SelectItem>
              <SelectItem value="false">Sem alarme</SelectItem>
            </SelectContent>
          </Select>
          <Select value={hasDivergence} onValueChange={setHasDivergence}>
            <SelectTrigger><SelectValue placeholder="Com divergência" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Com divergência: todos</SelectItem>
              <SelectItem value="true">Com divergência</SelectItem>
              <SelectItem value="false">Sem divergência</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
      {isError ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Falha ao carregar VSI/VPLS"}</p> : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>VS-ID</TableHead>
                <TableHead>Nome da VSI</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Sites</TableHead>
                <TableHead>Dispositivos</TableHead>
                <TableHead>ACs</TableHead>
                <TableHead>PWs</TableHead>
                <TableHead>Alarmes</TableHead>
                <TableHead>Última coleta</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell><Badge>{service.status}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{service.vs_id ?? "—"}</TableCell>
                  <TableCell>{service.name}</TableCell>
                  <TableCell>{service.tenant_name}</TableCell>
                  <TableCell>{service.sites_count}</TableCell>
                  <TableCell>{service.devices_count}</TableCell>
                  <TableCell>{service.acs_count}</TableCell>
                  <TableCell>{service.pws_up_count}/{service.pws_count}</TableCell>
                  <TableCell>{service.alarms_count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{service.last_collected_at ? new Date(service.last_collected_at).toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setDetailId(service.id)}>
                      <Eye className="mr-2 h-4 w-4" />
                      Detalhe
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!services.length ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                    Sem resultados com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <VsiVplsDetailSheet id={detailId} open={Boolean(detailId)} onOpenChange={(open) => !open && setDetailId(null)} />
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useListDevices } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, Eye, Filter, Layers, Network, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useL2Circuits, type L2Circuit, type L2CircuitType, type L2Status } from "@/features/l2-circuits/l2-circuits-api";
import {
  CircuitTypeBadge,
  FindingsCountBadge,
  NocFindingBadges,
  OperStatusBadge,
  circuitTypeGroup,
  circuitTypeLabel,
} from "@/features/l2-circuits/l2-circuit-badges";
import { L2CircuitDetailSheet } from "@/features/l2-circuits/l2-circuit-detail-sheet";
import { downloadL2CircuitsCsv } from "@/features/l2-circuits/l2-circuits-export";
import { L2CircuitsEmptyState } from "@/features/l2-circuits/l2-circuits-empty-state";
import {
  clearL2CircuitFilters,
  loadL2CircuitFilters,
  saveL2CircuitFilters,
} from "@/features/l2-circuits/l2-circuits-filter-storage";
import {
  FILTER_ALL,
  circuitKeyField,
  formatTs,
  matchesFilters,
  nocRowClass,
  sortCircuitsForNoc,
} from "@/features/l2-circuits/l2-circuits-utils";

const CIRCUIT_TYPES: L2CircuitType[] = [
  "vlan_local",
  "vlan_orphan",
  "l3_interface",
  "l3_vrf_link",
  "config_only",
  "l2vc",
  "vpws",
  "vsi",
  "vpls",
  "dot1q_subif",
  "vlan",
];

const STATUSES: L2Status[] = ["UP", "DOWN", "PARTIAL", "UNKNOWN", "CONFIG_ONLY"];

export default function L2Circuits() {
  const { user } = useAuth();
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState<string>(FILTER_ALL);
  const [circuitTypeFilter, setCircuitTypeFilter] = useState<string>(FILTER_ALL);
  const [statusFilter, setStatusFilter] = useState<string>(FILTER_ALL);
  const [vlanFilter, setVlanFilter] = useState("");
  const [vcIdFilter, setVcIdFilter] = useState("");
  const [peerIpFilter, setPeerIpFilter] = useState("");
  const [selectedCircuit, setSelectedCircuit] = useState<L2Circuit | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    const saved = loadL2CircuitFilters(user?.id);
    setDeviceFilter(saved.device);
    setCircuitTypeFilter(saved.circuitType);
    setStatusFilter(saved.status);
    setVlanFilter(saved.vlan);
    setVcIdFilter(saved.vcId);
    setPeerIpFilter(saved.peerIp);
    setFiltersLoaded(true);
  }, [user?.id]);

  useEffect(() => {
    if (!filtersLoaded) return;
    saveL2CircuitFilters(
      {
        device: deviceFilter,
        circuitType: circuitTypeFilter,
        status: statusFilter,
        vlan: vlanFilter,
        vcId: vcIdFilter,
        peerIp: peerIpFilter,
      },
      user?.id,
    );
  }, [
    filtersLoaded,
    user?.id,
    deviceFilter,
    circuitTypeFilter,
    statusFilter,
    vlanFilter,
    vcIdFilter,
    peerIpFilter,
  ]);

  const deviceId = deviceFilter === FILTER_ALL ? undefined : Number(deviceFilter);
  const { data, isLoading, isError, error, refetch, isFetching } = useL2Circuits(deviceId);
  const { data: devices } = useListDevices();

  const deviceNameById = useMemo(() => {
    const map = new Map<number, string>();
    devices?.forEach((device) => map.set(device.id, device.hostname));
    return map;
  }, [devices]);

  const sortedCircuits = useMemo(() => {
    const circuits = data?.circuits ?? [];
    const filtered = circuits.filter((circuit) =>
      matchesFilters(circuit, {
        circuitType: circuitTypeFilter,
        status: statusFilter,
        vlan: vlanFilter,
        vcId: vcIdFilter,
        peerIp: peerIpFilter,
      }),
    );
    return sortCircuitsForNoc(filtered);
  }, [data?.circuits, circuitTypeFilter, statusFilter, vlanFilter, vcIdFilter, peerIpFilter]);

  const summary = useMemo(() => {
    const local = sortedCircuits.filter((c) => circuitTypeGroup(c.circuitType) === "local").length;
    const mpls = sortedCircuits.filter((c) => circuitTypeGroup(c.circuitType) === "mpls").length;
    const vsi = sortedCircuits.filter((c) => circuitTypeGroup(c.circuitType) === "vsi").length;
    const up = sortedCircuits.filter((c) => c.operStatus === "UP").length;
    const down = sortedCircuits.filter((c) => c.operStatus === "DOWN").length;
    const withFindings = sortedCircuits.filter((c) => c.findings.length > 0).length;
    return { total: sortedCircuits.length, local, mpls, vsi, up, down, withFindings };
  }, [sortedCircuits]);

  const hasLoadedData = (data?.circuits?.length ?? 0) > 0;
  const showNoData = !isLoading && !isError && !hasLoadedData;
  const showNoMatch = !isLoading && !isError && hasLoadedData && sortedCircuits.length === 0;

  const openDetail = (circuit: L2Circuit) => {
    setSelectedCircuit(circuit);
    setDetailOpen(true);
  };

  const handleClearFilters = () => {
    setDeviceFilter(FILTER_ALL);
    setCircuitTypeFilter(FILTER_ALL);
    setStatusFilter(FILTER_ALL);
    setVlanFilter("");
    setVcIdFilter("");
    setPeerIpFilter("");
    clearL2CircuitFilters(user?.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" />
            L2 Circuits
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Consulta read-only — vlan_local, L2VC/VPWS, VSI/VPLS. Ordenacao NOC: DOWN primeiro.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadL2CircuitsCsv(sortedCircuits, deviceNameById)}
            disabled={sortedCircuits.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar lista
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total (filtrado)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total}</div>
            <CardDescription>{data?.total ?? 0} carregados da API</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Familia</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline" className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Local {summary.local}</Badge>
            <Badge variant="outline" className="bg-violet-500/10 text-violet-300 border-violet-500/20">MPLS {summary.mpls}</Badge>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">VSI {summary.vsi}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Oper status</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3 text-sm">
            <span className="text-green-400">UP {summary.up}</span>
            <span className="text-red-400">DOWN {summary.down}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Com findings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.withFindings}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
          <CardDescription>Device refaz query API. Demais filtros locais. Persistidos neste navegador.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Select value={deviceFilter} onValueChange={setDeviceFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Device" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>Todos devices</SelectItem>
              {devices?.map((device) => (
                <SelectItem key={device.id} value={String(device.id)}>
                  #{device.id} {device.hostname}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={circuitTypeFilter} onValueChange={setCircuitTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>Todos tipos</SelectItem>
              {CIRCUIT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {circuitTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>Todos status</SelectItem>
              {STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input placeholder="VLAN" value={vlanFilter} onChange={(e) => setVlanFilter(e.target.value)} />
          <Input placeholder="VC-ID" value={vcIdFilter} onChange={(e) => setVcIdFilter(e.target.value)} />
          <Input placeholder="Peer IP" value={peerIpFilter} onChange={(e) => setPeerIpFilter(e.target.value)} />
        </CardContent>
        <CardContent className="pt-0">
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            Limpar filtros
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Circuitos
          </CardTitle>
          <CardDescription className="hidden sm:block">
            Linhas com CIRCUIT_DOWN ou REMOTE_NOT_FORWARDING destacadas. Clique para detalhe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando circuitos...</p>}
          {isError && (
            <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Falha ao carregar circuitos"}</p>
          )}

          {showNoData && <L2CircuitsEmptyState variant="no-data" />}
          {showNoMatch && <L2CircuitsEmptyState variant="no-match" />}

          {!isLoading && !isError && sortedCircuits.length > 0 && (
            <>
              <div className="space-y-2 md:hidden">
                {sortedCircuits.map((circuit) => (
                  <button
                    key={circuit.id}
                    type="button"
                    onClick={() => openDetail(circuit)}
                    className={`w-full rounded-md border p-3 text-left ${nocRowClass(circuit)}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{circuit.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {deviceNameById.get(circuit.deviceId) ?? circuit.deviceId} · #{circuit.id}
                        </div>
                      </div>
                      <OperStatusBadge status={circuit.operStatus} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <CircuitTypeBadge type={circuit.circuitType} />
                      <FindingsCountBadge findings={circuit.findings} />
                      <NocFindingBadges findings={circuit.findings} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-xs font-mono text-muted-foreground">
                      <span>{circuit.localInterface ?? "—"}</span>
                      <span>{circuit.peerIp ?? "—"}</span>
                      <span>{circuitKeyField(circuit)}</span>
                      <span>{formatTs(circuit.lastSeen)}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="hidden md:block rounded-md border overflow-x-auto">
                <Table className="min-w-[960px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-10 bg-background">ID</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="hidden lg:table-cell">Nome</TableHead>
                      <TableHead className="hidden xl:table-cell">Interface</TableHead>
                      <TableHead>VLAN/VC/VSI</TableHead>
                      <TableHead className="hidden lg:table-cell">Peer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Findings</TableHead>
                      <TableHead className="hidden sm:table-cell">Last seen</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedCircuits.map((circuit) => (
                      <TableRow
                        key={circuit.id}
                        className={`cursor-pointer ${nocRowClass(circuit)}`}
                        onClick={() => openDetail(circuit)}
                      >
                        <TableCell className="sticky left-0 z-10 bg-inherit font-mono text-xs">#{circuit.id}</TableCell>
                        <TableCell>
                          <div className="text-sm truncate max-w-[120px]" title={deviceNameById.get(circuit.deviceId)}>
                            {deviceNameById.get(circuit.deviceId) ?? "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">ID {circuit.deviceId}</div>
                        </TableCell>
                        <TableCell>
                          <CircuitTypeBadge type={circuit.circuitType} />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell max-w-[160px] truncate" title={circuit.name}>
                          {circuit.name}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell font-mono text-xs max-w-[140px] truncate" title={circuit.localInterface ?? ""}>
                          {circuit.localInterface ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{circuitKeyField(circuit)}</TableCell>
                        <TableCell className="hidden lg:table-cell font-mono text-xs">{circuit.peerIp ?? "—"}</TableCell>
                        <TableCell>
                          <OperStatusBadge status={circuit.operStatus} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <FindingsCountBadge findings={circuit.findings} />
                            <NocFindingBadges findings={circuit.findings} />
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs whitespace-nowrap">{formatTs(circuit.lastSeen)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetail(circuit);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <L2CircuitDetailSheet
        circuitId={selectedCircuit?.id ?? null}
        fallback={selectedCircuit}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}

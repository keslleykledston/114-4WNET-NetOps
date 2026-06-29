import { useEffect, useMemo, useState } from "react";
import { useListDevices } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download, Eye, Filter, Layers, Network, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useTranslation } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import {
  useL2Circuits,
  formatL2OperationalRefreshToast,
  useRefreshL2Circuits,
  type L2Circuit,
  type L2CircuitType,
  type L2Status,
} from "@/features/l2-circuits/l2-circuits-api";
import {
  CircuitTypeBadge,
  FreshnessBadge,
  OperStatusBadge,
  circuitTypeGroup,
  circuitTypeLabel,
} from "@/features/l2-circuits/l2-circuit-badges";
import { DeviceCell, FindingsCell, PeerCell } from "@/features/l2-circuits/l2-circuit-table-cells";
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
  isProblemCircuit,
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
  const { t } = useTranslation();
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState<string>(FILTER_ALL);
  const [circuitTypeFilter, setCircuitTypeFilter] = useState<string>(FILTER_ALL);
  const [statusFilter, setStatusFilter] = useState<string>(FILTER_ALL);
  const [vlanFilter, setVlanFilter] = useState("");
  const [vcIdFilter, setVcIdFilter] = useState("");
  const [peerIpFilter, setPeerIpFilter] = useState("");
  const [showHealthy, setShowHealthy] = useState(false);
  const [selectedCircuit, setSelectedCircuit] = useState<L2Circuit | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { toast } = useToast();
  const refreshMutation = useRefreshL2Circuits();

  useEffect(() => {
    const saved = loadL2CircuitFilters(user?.id);
    setDeviceFilter(saved.device);
    setCircuitTypeFilter(saved.circuitType);
    setStatusFilter(saved.status);
    setVlanFilter(saved.vlan);
    setVcIdFilter(saved.vcId);
    setPeerIpFilter(saved.peerIp);
    setShowHealthy(saved.showHealthy);
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
        showHealthy,
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
    showHealthy,
  ]);

  const deviceId = deviceFilter === FILTER_ALL ? undefined : Number(deviceFilter);
  const { data, isLoading, isError, error, refetch } = useL2Circuits(deviceId);
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
        showHealthy,
      }),
    );
    const visible = showHealthy ? filtered : filtered.filter(isProblemCircuit);
    return sortCircuitsForNoc(visible);
  }, [data?.circuits, circuitTypeFilter, statusFilter, vlanFilter, vcIdFilter, peerIpFilter, showHealthy]);

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
    setShowHealthy(false);
    clearL2CircuitFilters(user?.id);
  };

  const handleOperationalRefresh = () => {
    if (!deviceId) {
      toast({
        title: t("l2Circuits.toastSelectDevice"),
        description: t("l2Circuits.toastSelectDeviceDesc"),
        variant: "destructive",
      });
      return;
    }

    void refreshMutation
      .mutateAsync(deviceId)
      .then((result) => {
        toast({
          title: t("l2Circuits.toastRefreshDone"),
          description: formatL2OperationalRefreshToast(result),
        });
        void refetch();
      })
      .catch((error: unknown) => {
        const code = (error as Error & { code?: string }).code;
        const status = (error as Error & { status?: number }).status;
        toast({
          title: code === "L2_OPERATIONAL_REFRESH_DISABLED" || status === 503 ? t("l2Circuits.toastRefreshDisabled") : t("l2Circuits.toastRefreshFailed"),
          description: error instanceof Error ? error.message : t("l2Circuits.unknownError"),
          variant: "destructive",
        });
      });
  };

  const operational = data?.operational;
  const refreshBusy = refreshMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" />
            {t("l2Circuits.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("l2Circuits.subtitle")}
          </p>
          {deviceId && operational && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <FreshnessBadge freshness={operational.freshness} />
              <span className="text-muted-foreground">
                {t("l2Circuits.lastOperationalRefresh")}{" "}
                {operational.last_refresh_at ? formatTs(operational.last_refresh_at) : t("common.never")}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadL2CircuitsCsv(sortedCircuits, deviceNameById)}
            disabled={sortedCircuits.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            {t("l2Circuits.exportCsv")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleOperationalRefresh} disabled={refreshBusy || !deviceId}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshBusy ? "animate-spin" : ""}`} />
            {t("l2Circuits.refreshOperational")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("l2Circuits.totalFiltered")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total}</div>
            <CardDescription>{t("l2Circuits.loadedFromApi", { count: data?.total ?? 0 })}</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("l2Circuits.family")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline" className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Local {summary.local}</Badge>
            <Badge variant="outline" className="bg-violet-500/10 text-violet-300 border-violet-500/20">MPLS {summary.mpls}</Badge>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">VSI {summary.vsi}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("l2Circuits.operStatus")}</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3 text-sm">
            <span className="text-green-400">UP {summary.up}</span>
            <span className="text-red-400">DOWN {summary.down}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("l2Circuits.withFindings")}</CardTitle>
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
            {t("l2Circuits.filtersTitle")}
          </CardTitle>
          <CardDescription>{t("l2Circuits.filtersDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Select value={deviceFilter} onValueChange={setDeviceFilter}>
            <SelectTrigger>
              <SelectValue placeholder={t("l2Circuits.device")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>{t("l2Circuits.allDevices")}</SelectItem>
              {devices?.map((device) => (
                <SelectItem key={device.id} value={String(device.id)}>
                  #{device.id} {device.hostname}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={circuitTypeFilter} onValueChange={setCircuitTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder={t("l2Circuits.type")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>{t("l2Circuits.allTypes")}</SelectItem>
              {CIRCUIT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {circuitTypeLabel(type, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder={t("l2Circuits.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>{t("l2Circuits.allStatuses")}</SelectItem>
              {STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input placeholder={t("l2Circuits.vlan")} value={vlanFilter} onChange={(e) => setVlanFilter(e.target.value)} />
          <Input placeholder={t("l2Circuits.vcId")} value={vcIdFilter} onChange={(e) => setVcIdFilter(e.target.value)} />
          <Input placeholder={t("l2Circuits.peerIp")} value={peerIpFilter} onChange={(e) => setPeerIpFilter(e.target.value)} />
        </CardContent>
        <CardContent className="pt-0 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="l2-show-healthy"
              checked={showHealthy}
              onCheckedChange={(checked) => setShowHealthy(checked === true)}
            />
            <Label htmlFor="l2-show-healthy" className="text-sm font-normal cursor-pointer">
              {t("l2Circuits.showHealthy")}
            </Label>
          </div>
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            {t("l2Circuits.clearFilters")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" />
            {t("l2Circuits.circuits")}
          </CardTitle>
          <CardDescription className="hidden sm:block">
            {t("l2Circuits.circuitsDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">{t("l2Circuits.loading")}</p>}
          {isError && (
            <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("l2Circuits.loadFailed")}</p>
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
                      <FindingsCell findings={circuit.findings} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-xs font-mono text-muted-foreground">
                      <PeerCell circuit={circuit} />
                      <span>{circuitKeyField(circuit)}</span>
                      <span className="col-span-2">{formatTs(circuit.lastSeen)}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="hidden md:block rounded-md border overflow-x-auto">
                <Table className="min-w-[900px] text-sm">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="sticky left-0 z-10 bg-background h-8 px-2 w-14">{t("l2Circuits.tableId")}</TableHead>
                      <TableHead className="h-8 px-2 min-w-[200px]">{t("l2Circuits.tableDevice")}</TableHead>
                      <TableHead className="h-8 px-2 w-24">{t("l2Circuits.tableType")}</TableHead>
                      <TableHead className="hidden lg:table-cell h-8 px-2 min-w-[120px]">{t("l2Circuits.tableName")}</TableHead>
                      <TableHead className="h-8 px-2 w-28">{t("l2Circuits.tableVlanVcVsi")}</TableHead>
                      <TableHead className="h-8 px-2 min-w-[150px]">{t("l2Circuits.tablePeer")}</TableHead>
                      <TableHead className="h-8 px-2 w-24">{t("l2Circuits.tableStatus")}</TableHead>
                      <TableHead className="h-8 px-2 min-w-[160px]">{t("l2Circuits.tableFindings")}</TableHead>
                      <TableHead className="hidden sm:table-cell h-8 px-2 w-36">{t("l2Circuits.tableLastSeen")}</TableHead>
                      <TableHead className="h-8 w-10 px-1" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedCircuits.map((circuit) => (
                      <TableRow
                        key={circuit.id}
                        className={`cursor-pointer ${nocRowClass(circuit)}`}
                        onClick={() => openDetail(circuit)}
                      >
                        <TableCell className="sticky left-0 z-10 bg-inherit font-mono text-xs py-1 px-2">
                          #{circuit.id}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          <DeviceCell hostname={deviceNameById.get(circuit.deviceId)} />
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          <CircuitTypeBadge type={circuit.circuitType} />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell py-1 px-2 max-w-[180px] truncate" title={circuit.name}>
                          {circuit.name}
                        </TableCell>
                        <TableCell className="font-mono text-xs py-1 px-2">{circuitKeyField(circuit)}</TableCell>
                        <TableCell className="py-1 px-2">
                          <PeerCell circuit={circuit} />
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          <OperStatusBadge status={circuit.operStatus} />
                        </TableCell>
                        <TableCell className="py-1 px-2 align-top">
                          <FindingsCell findings={circuit.findings} />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs whitespace-nowrap py-1 px-2">
                          {formatTs(circuit.lastSeen)}
                        </TableCell>
                        <TableCell className="py-1 px-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
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
        deviceName={selectedCircuit ? deviceNameById.get(selectedCircuit.deviceId) : undefined}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}

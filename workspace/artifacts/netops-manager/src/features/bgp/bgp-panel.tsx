import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListNetopsDeviceBgpPeersQueryKey,
  getListDeviceBgpPeersQueryKey,
  useUpdateNetopsDeviceBgpPeerRole,
} from "@workspace/api-client-react";
import type {
  Device,
  ListNetopsDeviceBgpPeersParams,
  NetopsBgpPeer,
  NetopsBgpPeerRole,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Download, FileSearch, GitBranch, Network, Save, Search } from "lucide-react";
import { BgpPeerModal } from "./bgp-peer-modal";
import { BgpPeerRoutesModal } from "./bgp-peer-routes-modal";
import { BgpPeerDetailModal } from "./bgp-peer-detail-modal";
import { formatBgpUptime } from "./format-bgp-uptime";
import { CollectSnmpButton } from "@/features/device-inventory/collect-snmp-button";
import { useDiscoveryBgpPeers, type DiscoveryBgpPeer } from "@/features/device-discovery/discovery-api";

interface BgpPanelProps {
  device: Device;
  title: string;
  role?: ListNetopsDeviceBgpPeersParams["role"];
}

type StateFilter = "all" | NetopsBgpPeer["state"] | "Down";
type RoleFilter = "all" | NetopsBgpPeerRole;
type AfFilter = "all" | NetopsBgpPeer["addressFamily"];

const STORAGE_PREFIX = "netops:bgp-filters:";

const roleLabel: Partial<Record<NetopsBgpPeerRole, string>> = {
  provider: "Operadora",
  customer: "Cliente",
  cdn: "CDN",
  ix: "IX",
  cdn_ix: "CDN/IX",
  ibgp: "iBGP",
};

function formatRoleLabel(role: NetopsBgpPeerRole) {
  return roleLabel[role] ?? "Cliente";
}

const roleOptions: Array<{ value: RoleFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "customer", label: "Cliente" },
  { value: "provider", label: "Operadora" },
  { value: "ix", label: "IX" },
  { value: "cdn", label: "CDN" },
  { value: "cdn_ix", label: "CDN/IX" },
  { value: "ibgp", label: "iBGP" },
];

const editableRoleOptions: NetopsBgpPeerRole[] = ["customer", "provider", "ix", "cdn", "ibgp"];

const stateOptions: Array<{ value: StateFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "Established", label: "Established" },
  { value: "Active", label: "Active" },
  { value: "Idle", label: "Idle" },
  { value: "Connect", label: "Connect" },
  { value: "Down", label: "Down / Not Established" },
];

const afOptions: Array<{ value: AfFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "ipv4", label: "IPv4" },
  { value: "ipv6", label: "IPv6" },
];

interface StoredBgpFilters {
  search: string;
  stateFilter: StateFilter;
  roleFilter: RoleFilter;
  afFilter: AfFilter;
  includeIbgp: boolean;
}

function peerEditKey(peer: Pick<DiscoveryBgpPeer, "peerIp" | "addressFamily">): string {
  return `${peer.peerIp}|${peer.addressFamily}`;
}

function peerMatchesSearch(peer: DiscoveryBgpPeer, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return [
    peer.peerIp,
    peer.remoteAs?.toString(),
    peer.description,
    peer.name,
    peer.vrf,
    peer.importPolicy,
    peer.exportPolicy,
  ].some((value) => value?.toLowerCase().includes(term));
}

function loadStoredFilters(deviceId: number): StoredBgpFilters | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${deviceId}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredBgpFilters;
  } catch {
    return null;
  }
}

function buildListParams(
  role: ListNetopsDeviceBgpPeersParams["role"] | undefined,
  stateFilter: StateFilter,
  afFilter: AfFilter,
): ListNetopsDeviceBgpPeersParams | undefined {
  const params: ListNetopsDeviceBgpPeersParams = {};
  if (role) params.role = role;
  if (stateFilter !== "all") params.state = stateFilter;
  if (afFilter === "ipv4" || afFilter === "ipv6") params.af = afFilter;
  return Object.keys(params).length ? params : undefined;
}

export function BgpPanel({ device, title, role }: BgpPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(role ?? "all");
  const [afFilter, setAfFilter] = useState<AfFilter>("all");
  const [includeIbgp, setIncludeIbgp] = useState(role === "ibgp");
  const [editedRoles, setEditedRoles] = useState<Record<string, NetopsBgpPeerRole>>({});
  const [savingPeer, setSavingPeer] = useState<string | null>(null);
  const [modalPeer, setModalPeer] = useState<DiscoveryBgpPeer | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [routesModalPeer, setRoutesModalPeer] = useState<DiscoveryBgpPeer | null>(null);
  const [routesModalOpen, setRoutesModalOpen] = useState(false);
  const [routesDirection, setRoutesDirection] = useState<"received" | "advertised">("received");
  const [detailModalPeer, setDetailModalPeer] = useState<DiscoveryBgpPeer | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const listParams = useMemo(
    () => buildListParams(role, stateFilter, afFilter),
    [afFilter, role, stateFilter],
  );

  const { data: peers, isLoading, isError } = useDiscoveryBgpPeers(device.id, role);

  useEffect(() => {
    if (role) {
      setRoleFilter(role);
      if (role === "ibgp") setIncludeIbgp(true);
      return;
    }
    const stored = loadStoredFilters(device.id);
    if (!stored) return;
    setSearch(stored.search ?? "");
    setStateFilter(stored.stateFilter ?? "all");
    setRoleFilter(stored.roleFilter ?? "all");
    setAfFilter(stored.afFilter ?? "all");
    setIncludeIbgp(stored.includeIbgp ?? false);
  }, [device.id, role]);

  useEffect(() => {
    const payload: StoredBgpFilters = {
      search,
      stateFilter,
      roleFilter: role ?? roleFilter,
      afFilter,
      includeIbgp,
    };
    localStorage.setItem(`${STORAGE_PREFIX}${device.id}`, JSON.stringify(payload));
  }, [afFilter, device.id, includeIbgp, role, roleFilter, search, stateFilter]);

  const updateRole = useUpdateNetopsDeviceBgpPeerRole({
    mutation: {
      onSuccess: async (_data, variables) => {
        const key = `${variables.peerIp}|${variables.data.addressFamily}`;
        const nextRole = variables.data.role;

        const netopsQueries = queryClient.getQueriesData<DiscoveryBgpPeer[]>({
          queryKey: getListNetopsDeviceBgpPeersQueryKey(device.id),
        });

        netopsQueries.forEach(([queryKey, current]) => {
          if (!current) return;
          const next = current.map((peer) => {
            if (peer.peerIp !== variables.peerIp || peer.addressFamily !== variables.data.addressFamily) return peer;
            return {
              ...peer,
              role: nextRole,
              roleSource: "manual_override" as const,
            };
          });
          queryClient.setQueryData(queryKey, next);
        });

        const cachedQueries = queryClient.getQueriesData<DiscoveryBgpPeer[]>({
          queryKey: getListDeviceBgpPeersQueryKey(device.id),
        });

        cachedQueries.forEach(([queryKey, current]) => {
          if (!current) return;
          const params = (queryKey[1] as { category?: string } | undefined) ?? undefined;
          const currentCategory = params?.category;
          const next = current
            .filter((peer) => {
              if (peer.peerIp !== variables.peerIp || peer.addressFamily !== variables.data.addressFamily) return true;
              if (!currentCategory || currentCategory === nextRole) return true;
              return false;
            })
            .map((peer) => {
              if (peer.peerIp !== variables.peerIp || peer.addressFamily !== variables.data.addressFamily) return peer;
              return {
                ...peer,
                role: nextRole,
                category: nextRole,
                roleSource: "manual_override" as const,
                primaryDirection: nextRole === "customer" ? "import" : nextRole === "ibgp" ? "internal" : "export",
              };
            });

          queryClient.setQueryData(queryKey, next);
        });

        setEditedRoles((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        await queryClient.invalidateQueries({ queryKey: getListNetopsDeviceBgpPeersQueryKey(device.id) });
        await queryClient.invalidateQueries({ queryKey: getListDeviceBgpPeersQueryKey(device.id) });
        toast({ title: "Papel BGP salvo" });
      },
      onError: (err) => {
        toast({
          title: "Erro ao salvar papel BGP",
          description: err instanceof Error ? err.message : "Falha desconhecida",
          variant: "destructive",
        });
      },
      onSettled: () => setSavingPeer(null),
    },
  });

  const filteredPeers = useMemo(() => {
    return (peers ?? []).filter((peer) => {
      const selectedRole = editedRoles[peerEditKey(peer)] ?? peer.role;
      if (!includeIbgp && selectedRole === "ibgp") return false;
      if (!role && roleFilter !== "all" && selectedRole !== roleFilter) return false;
      if (afFilter === "ipv4" && peer.addressFamily !== "ipv4") return false;
      if (afFilter === "ipv6" && peer.addressFamily !== "ipv6") return false;
      if (stateFilter === "Down" && peer.state === "Established") return false;
      if (
        stateFilter !== "all" &&
        stateFilter !== "Down" &&
        peer.state !== stateFilter
      ) {
        return false;
      }
      return peerMatchesSearch(peer, search);
    });
  }, [afFilter, editedRoles, includeIbgp, peers, role, roleFilter, search, stateFilter]);

  const counters = useMemo(() => {
    const base = (peers ?? []).filter((peer) => includeIbgp || (editedRoles[peerEditKey(peer)] ?? peer.role) !== "ibgp");
    return {
      total: base.length,
      established: base.filter((peer) => peer.state === "Established").length,
      down: base.filter((peer) => peer.state !== "Established").length,
      ebgp: base.filter((peer) => peer.sessionType === "eBGP").length,
      ibgp: (peers ?? []).filter((peer) => (editedRoles[peerEditKey(peer)] ?? peer.role) === "ibgp").length,
      customer: countRoleWithEdits(base, editedRoles, "customer"),
      provider: countRoleWithEdits(base, editedRoles, "provider"),
      ix: countRoleWithEdits(base, editedRoles, "ix"),
      cdn: countRoleWithEdits(base, editedRoles, "cdn"),
      cdnIx: countRoleWithEdits(base, editedRoles, "cdn_ix"),
      ipv4: base.filter((peer) => peer.addressFamily === "ipv4").length,
      ipv6: base.filter((peer) => peer.addressFamily === "ipv6").length,
    };
  }, [editedRoles, includeIbgp, peers]);

  function openPeerModal(peer: DiscoveryBgpPeer) {
    setRoutesModalOpen(false);
    setDetailModalOpen(false);
    setModalPeer(peer);
    setModalOpen(true);
  }

  function openRoutesModal(peer: DiscoveryBgpPeer, direction: "received" | "advertised") {
    setModalOpen(false);
    setDetailModalOpen(false);
    setRoutesModalPeer(peer);
    setRoutesDirection(direction);
    setRoutesModalOpen(true);
  }

  function openDetailModal(peer: DiscoveryBgpPeer) {
    setModalOpen(false);
    setRoutesModalOpen(false);
    setDetailModalPeer(peer);
    setDetailModalOpen(true);
  }

  function saveRole(peer: DiscoveryBgpPeer) {
    const selectedRole = editedRoles[peerEditKey(peer)];
    if (!selectedRole || selectedRole === peer.role) return;
    setSavingPeer(peerEditKey(peer));
    updateRole.mutate({
      id: device.id,
      peerIp: peer.peerIp,
      data: {
        addressFamily: peer.addressFamily,
        remoteAs: peer.remoteAs ?? null,
        role: selectedRole,
        label: peer.name,
        notes: null,
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Network className="h-5 w-5" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <CollectSnmpButton device={device} />
            <Badge variant="outline">{role ? formatRoleLabel(role) : "Todos peers"}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar IP, ASN..."
              className="pl-9"
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Estado</div>
            <div className="flex flex-wrap gap-2">
              {stateOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setStateFilter(option.value as StateFilter)}
                  className={`h-8 rounded px-3 text-sm transition-colors ${
                    stateFilter === option.value
                      ? "bg-primary text-primary-foreground"
                      : "border bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Família de endereço</div>
            <div className="flex flex-wrap gap-2">
              {afOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setAfFilter(option.value as AfFilter)}
                  className={`h-8 rounded px-3 text-sm transition-colors ${
                    afFilter === option.value
                      ? "bg-primary text-primary-foreground"
                      : "border bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Papel</div>
              {!role && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={includeIbgp} onCheckedChange={(checked) => setIncludeIbgp(checked === true)} />
                  Incluir iBGP
                </label>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {roleOptions
                .filter((opt) => opt.value !== (includeIbgp ? "" : "ibgp"))
                .map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setRoleFilter(option.value as RoleFilter)}
                    disabled={!!role}
                    className={`h-8 rounded px-3 text-sm transition-colors disabled:opacity-50 ${
                      roleFilter === option.value
                        ? "bg-primary text-primary-foreground"
                        : "border bg-muted/20 hover:bg-muted/40"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-12">
          <Counter label="Total" value={counters.total} />
          <Counter label="Established" value={counters.established} />
          <Counter label="Down" value={counters.down} />
          <Counter label="eBGP" value={counters.ebgp} />
          <Counter label="iBGP" value={counters.ibgp} />
          <Counter label="Cliente" value={counters.customer} />
          <Counter label="Operadora" value={counters.provider} />
          <Counter label="IX" value={counters.ix} />
          <Counter label="CDN" value={counters.cdn} />
          <Counter label="CDN/IX" value={counters.cdnIx} />
          <Counter label="IPv4" value={counters.ipv4} />
          <Counter label="IPv6" value={counters.ipv6} />
        </div>

        {isLoading ? (
          <Skeleton className="h-44 w-full" />
        ) : isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Execute discovery para carregar peers BGP.
          </div>
        ) : !filteredPeers.length ? (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            Nenhum peer BGP encontrado para {device.hostname}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Peer IP</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>ASN remoto</TableHead>
                  <TableHead>Sessao / VRF</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Uptime</TableHead>
                  <TableHead>Papel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPeers.map((peer) => {
                  const selectedRole = editedRoles[peerEditKey(peer)] ?? peer.role;
                  const dirty = selectedRole !== peer.role;
                  const saving = savingPeer === peerEditKey(peer);
                  return (
                    <TableRow key={`${peer.peerIp}-${peer.remoteAs ?? "na"}-${peer.addressFamily}`}>
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <span>{peer.peerIp}</span>
                          <Link
                            href={`/bgp/peer-drilldown?deviceId=${device.id}&peer=${encodeURIComponent(peer.peerIp)}&auto=1`}
                            title="Drilldown snapshot (sem SSH)"
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 hover:bg-slate-800"
                            >
                              <GitBranch className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-slate-800"
                            onClick={() => openDetailModal(peer)}
                            title="Detalhes do peer"
                          >
                            <FileSearch className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-slate-800"
                            onClick={() => {
                              const direction = peer.role === "customer" ? "received" : "advertised";
                              openRoutesModal(peer, direction);
                            }}
                            title={peer.role === "customer" ? "Prefixos recebidos (SSH)" : "Prefixos anunciados (SSH)"}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{peer.name ?? peer.description ?? "-"}</TableCell>
                      <TableCell>{peer.remoteAs ?? "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="w-fit">{peer.sessionType}</Badge>
                          <span className="text-[10px] text-muted-foreground">{peer.vrf ?? "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{peer.state}</Badge></TableCell>
                      <TableCell>{formatBgpUptime(peer.uptime)}</TableCell>
                      <TableCell className="min-w-44">
                        <div className="flex items-center gap-2">
                          <Select
                            value={selectedRole}
                            onValueChange={(value) => {
                              if (value === "ibgp") {
                                setIncludeIbgp(true);
                              }
                              setEditedRoles((current) => ({
                                ...current,
                                [peerEditKey(peer)]: value as NetopsBgpPeerRole,
                              }));
                            }}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {editableRoleOptions.map((option) => (
                                <SelectItem key={option} value={option}>{formatRoleLabel(option)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {dirty && (
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => saveRole(peer)}
                              disabled={saving}
                              title="Salvar papel"
                            >
                              <Save className="h-3.5 w-3.5" />
                              {saving ? "..." : "Salvar"}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <BgpPeerModal
        device={device}
        peer={modalPeer}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />

      <BgpPeerRoutesModal
        device={device}
        peer={routesModalPeer}
        direction={routesDirection}
        isOpen={routesModalOpen}
        onClose={() => setRoutesModalOpen(false)}
      />

      <BgpPeerDetailModal
        device={device}
        peer={detailModalPeer}
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
      />
    </Card>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
    </div>
  );
}

function countRoleWithEdits(
  peers: DiscoveryBgpPeer[],
  editedRoles: Record<string, NetopsBgpPeerRole>,
  role: NetopsBgpPeerRole,
): number {
  return peers.filter((peer) => (editedRoles[peerEditKey(peer)] ?? peer.role) === role).length;
}

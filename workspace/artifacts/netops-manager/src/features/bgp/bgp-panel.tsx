import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListNetopsDeviceBgpPeersQueryKey,
  useListNetopsDeviceBgpPeers,
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
import { Activity, FileSearch, ListTree, Network, Route, Save, Search, ShieldCheck, X } from "lucide-react";
import { BgpPeerSheet, type BgpPeerActionKind } from "./bgp-peer-sheet";
import { CollectSnmpButton } from "@/features/device-inventory/collect-snmp-button";
import { toggleArrayFilter, matchesStateFilter, matchesRoleFilter, matchesAddressFamilyFilter } from "./filter-helpers";

interface BgpPanelProps {
  device: Device;
  title: string;
  role?: ListNetopsDeviceBgpPeersParams["role"];
}

type StateFilter = "all" | NetopsBgpPeer["state"] | "Down";
type RoleFilter = "all" | NetopsBgpPeerRole;
type AfFilter = "all" | NetopsBgpPeer["addressFamily"];

const STORAGE_PREFIX = "netops:bgp-filters:";

const roleLabel: Record<NetopsBgpPeerRole, string> = {
  provider: "Provedor",
  customer: "Cliente",
  cdn: "CDN",
  ix: "IX",
  cdn_ix: "CDN/IX",
  ibgp: "iBGP",
  unknown: "Não classificado",
};

const roleOptions: Array<{ value: RoleFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "customer", label: "Cliente" },
  { value: "provider", label: "Provedor" },
  { value: "ix", label: "IX" },
  { value: "cdn", label: "CDN" },
  { value: "cdn_ix", label: "CDN/IX" },
  { value: "ibgp", label: "iBGP" },
  { value: "unknown", label: "Não classificado" },
];

const editableRoleOptions: NetopsBgpPeerRole[] = ["customer", "provider", "ix", "cdn", "cdn_ix", "ibgp", "unknown"];

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
  { value: "unknown", label: "Unknown" },
];

const peerActions: Array<{ kind: BgpPeerActionKind; label: string; icon: typeof FileSearch }> = [
  { kind: "details", label: "Detalhes", icon: FileSearch },
  { kind: "received", label: "Prefixos recebidos", icon: Route },
  { kind: "advertised", label: "Prefixos exportados", icon: Route },
  { kind: "policies", label: "Policies", icon: ShieldCheck },
  { kind: "communities", label: "Communities", icon: ListTree },
  { kind: "diagnostics", label: "Diagnostico", icon: Activity },
];

interface StoredBgpFilters {
  search: string;
  selectedStates: string[];
  selectedRoles: string[];
  selectedAddressFamilies: string[];
  includeIbgp: boolean;
}

interface LegacyStoredBgpFilters {
  search?: string;
  stateFilter?: StateFilter;
  roleFilter?: RoleFilter;
  afFilter?: AfFilter;
  includeIbgp?: boolean;
}

function peerEditKey(peer: Pick<NetopsBgpPeer, "peerIp" | "addressFamily">): string {
  return `${peer.peerIp}|${peer.addressFamily}`;
}

function peerMatchesSearch(peer: NetopsBgpPeer, search: string): boolean {
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
    const data = JSON.parse(raw);

    // Migration from old format
    if ("stateFilter" in data || "roleFilter" in data || "afFilter" in data) {
      const legacy = data as LegacyStoredBgpFilters;
      return {
        search: legacy.search ?? "",
        selectedStates: legacy.stateFilter && legacy.stateFilter !== "all" ? [legacy.stateFilter] : [],
        selectedRoles: legacy.roleFilter && legacy.roleFilter !== "all" ? [legacy.roleFilter] : [],
        selectedAddressFamilies: legacy.afFilter && legacy.afFilter !== "all" ? [legacy.afFilter] : [],
        includeIbgp: legacy.includeIbgp ?? false,
      };
    }

    return data as StoredBgpFilters;
  } catch {
    return null;
  }
}

function buildListParams(
  role: ListNetopsDeviceBgpPeersParams["role"] | undefined,
  selectedStates: string[],
  selectedAddressFamilies: string[],
): ListNetopsDeviceBgpPeersParams | undefined {
  const params: ListNetopsDeviceBgpPeersParams = {};
  if (role) params.role = role;
  if (selectedStates.length === 1 && selectedStates[0] !== "Down") {
    params.state = selectedStates[0] as any;
  }
  if (selectedAddressFamilies.length === 1 && (selectedAddressFamilies[0] === "ipv4" || selectedAddressFamilies[0] === "ipv6")) {
    params.af = selectedAddressFamilies[0] as any;
  }
  return Object.keys(params).length ? params : undefined;
}

export function BgpPanel({ device, title, role }: BgpPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedAddressFamilies, setSelectedAddressFamilies] = useState<string[]>([]);
  const [includeIbgp, setIncludeIbgp] = useState(role === "ibgp");
  const [editedRoles, setEditedRoles] = useState<Record<string, NetopsBgpPeerRole>>({});
  const [savingPeer, setSavingPeer] = useState<string | null>(null);
  const [sheetPeer, setSheetPeer] = useState<NetopsBgpPeer | null>(null);
  const [sheetAction, setSheetAction] = useState<BgpPeerActionKind | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const listParams = useMemo(
    () => buildListParams(role, selectedStates, selectedAddressFamilies),
    [role, selectedStates, selectedAddressFamilies],
  );

  const { data: peers, isLoading, isError } = useListNetopsDeviceBgpPeers(device.id, listParams);

  useEffect(() => {
    if (role) {
      if (role === "ibgp") setIncludeIbgp(true);
      return;
    }
    const stored = loadStoredFilters(device.id);
    if (!stored) return;
    setSearch(stored.search ?? "");
    setSelectedStates(stored.selectedStates ?? []);
    setSelectedRoles(stored.selectedRoles ?? []);
    setSelectedAddressFamilies(stored.selectedAddressFamilies ?? []);
    setIncludeIbgp(stored.includeIbgp ?? false);
  }, [device.id, role]);

  useEffect(() => {
    const payload: StoredBgpFilters = {
      search,
      selectedStates,
      selectedRoles: role ? [] : selectedRoles,
      selectedAddressFamilies,
      includeIbgp,
    };
    localStorage.setItem(`${STORAGE_PREFIX}${device.id}`, JSON.stringify(payload));
  }, [device.id, includeIbgp, role, search, selectedAddressFamilies, selectedRoles, selectedStates]);

  const updateRole = useUpdateNetopsDeviceBgpPeerRole({
    mutation: {
      onSuccess: async (_data, variables) => {
        const key = `${variables.peerIp}|${variables.data.addressFamily}`;
        setEditedRoles((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        await queryClient.invalidateQueries({ queryKey: getListNetopsDeviceBgpPeersQueryKey(device.id) });
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
      if (!role && !matchesRoleFilter(selectedRole, selectedRoles)) return false;
      if (!matchesAddressFamilyFilter(peer.addressFamily, selectedAddressFamilies)) return false;
      if (!matchesStateFilter(peer.state, selectedStates)) return false;
      return peerMatchesSearch(peer, search);
    });
  }, [editedRoles, includeIbgp, peers, role, selectedAddressFamilies, selectedRoles, selectedStates, search]);

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
      unknown: countRoleWithEdits(base, editedRoles, "unknown"),
      ipv4: base.filter((peer) => peer.addressFamily === "ipv4").length,
      ipv6: base.filter((peer) => peer.addressFamily === "ipv6").length,
    };
  }, [editedRoles, includeIbgp, peers]);

  function openPeerAction(peer: NetopsBgpPeer, kind: BgpPeerActionKind) {
    setSheetPeer(peer);
    setSheetAction(kind);
    setSheetOpen(true);
  }

  function saveRole(peer: NetopsBgpPeer) {
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
            <Badge variant="outline">{role ? roleLabel[role] : "Todos peers"}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4">
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
            <div className="text-[11px] font-semibold uppercase text-muted-foreground">Estado</div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedStates([])}
                className={`h-8 rounded-md px-3 text-sm transition-colors ${
                  selectedStates.length === 0
                    ? "bg-primary text-primary-foreground"
                    : "border bg-muted/20 hover:bg-muted/40"
                }`}
              >
                Todos
              </button>
              {stateOptions.slice(1).map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedStates(toggleArrayFilter(selectedStates, option.value))}
                  className={`h-8 rounded-md px-3 text-sm transition-colors flex items-center gap-1.5 ${
                    selectedStates.includes(option.value)
                      ? "bg-primary text-primary-foreground"
                      : "border bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  {option.label}
                  {selectedStates.includes(option.value) && <X className="h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase text-muted-foreground">Família de endereço</div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedAddressFamilies([])}
                className={`h-8 rounded-md px-3 text-sm transition-colors ${
                  selectedAddressFamilies.length === 0
                    ? "bg-primary text-primary-foreground"
                    : "border bg-muted/20 hover:bg-muted/40"
                }`}
              >
                Todos
              </button>
              {afOptions.slice(1).map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedAddressFamilies(toggleArrayFilter(selectedAddressFamilies, option.value))}
                  className={`h-8 rounded-md px-3 text-sm transition-colors flex items-center gap-1.5 ${
                    selectedAddressFamilies.includes(option.value)
                      ? "bg-primary text-primary-foreground"
                      : "border bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  {option.label}
                  {selectedAddressFamilies.includes(option.value) && <X className="h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase text-muted-foreground">Papel</div>
              {!role && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={includeIbgp} onCheckedChange={(checked) => setIncludeIbgp(checked === true)} />
                  Incluir iBGP
                </label>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedRoles([])}
                disabled={!!role}
                className={`h-8 rounded-md px-3 text-sm transition-colors disabled:opacity-50 ${
                  selectedRoles.length === 0
                    ? "bg-primary text-primary-foreground"
                    : "border bg-muted/20 hover:bg-muted/40"
                }`}
              >
                Todos
              </button>
              {roleOptions.slice(1, includeIbgp ? undefined : -1).map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedRoles(toggleArrayFilter(selectedRoles, option.value))}
                  disabled={!!role}
                  className={`h-8 rounded-md px-3 text-sm transition-colors disabled:opacity-50 flex items-center gap-1.5 ${
                    selectedRoles.includes(option.value)
                      ? "bg-primary text-primary-foreground"
                      : "border bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  {option.label}
                  {selectedRoles.includes(option.value) && <X className="h-3 w-3" />}
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
          <Counter label="Provedor" value={counters.provider} />
          <Counter label="IX" value={counters.ix} />
          <Counter label="CDN" value={counters.cdn} />
          <Counter label="CDN/IX" value={counters.cdnIx} />
          <Counter label="Não classificado" value={counters.unknown} />
          <Counter label="IPv4" value={counters.ipv4} />
          <Counter label="IPv6" value={counters.ipv6} />
        </div>

        {isLoading ? (
          <Skeleton className="h-44 w-full" />
        ) : isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Falha ao carregar peers BGP.
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
                  <TableHead className="min-w-56">Acoes read-only</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPeers.map((peer) => {
                  const selectedRole = editedRoles[peerEditKey(peer)] ?? peer.role;
                  const dirty = selectedRole !== peer.role;
                  const saving = savingPeer === peerEditKey(peer);
                  return (
                    <TableRow key={`${peer.peerIp}-${peer.remoteAs ?? "na"}-${peer.addressFamily}`}>
                      <TableCell className="font-mono text-xs">{peer.peerIp}</TableCell>
                      <TableCell>{peer.name ?? peer.description ?? "-"}</TableCell>
                      <TableCell>{peer.remoteAs ?? "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="w-fit">{peer.sessionType}</Badge>
                          <span className="text-xs text-muted-foreground">{peer.vrf ?? "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{peer.state}</Badge></TableCell>
                      <TableCell>{peer.uptime ?? "-"}</TableCell>
                      <TableCell className="min-w-44">
                        <div className="flex items-center gap-2">
                          <Select
                            value={selectedRole}
                            onValueChange={(value) => setEditedRoles((current) => ({
                              ...current,
                              [peerEditKey(peer)]: value as NetopsBgpPeerRole,
                            }))}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {editableRoleOptions.map((option) => (
                                <SelectItem key={option} value={option}>{option}</SelectItem>
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
                              title="Salvar papel local"
                            >
                              <Save className="h-3.5 w-3.5" />
                              {saving ? "..." : "Salvar"}
                            </Button>
                          )}
                        </div>
                        <span className="mt-1 block text-[10px] text-muted-foreground">{peer.roleSource}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {peerActions.map(({ kind, label, icon: Icon }) => (
                            <Button
                              key={kind}
                              type="button"
                              variant="outline"
                              size="sm"
                              title={`${label} read-only`}
                              className="h-7 px-2 text-[11px]"
                              onClick={() => openPeerAction(peer, kind)}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {label}
                            </Button>
                          ))}
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

      <BgpPeerSheet
        device={device}
        peer={sheetPeer}
        action={sheetAction}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
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
  peers: NetopsBgpPeer[],
  editedRoles: Record<string, NetopsBgpPeerRole>,
  role: NetopsBgpPeerRole,
): number {
  return peers.filter((peer) => (editedRoles[peerEditKey(peer)] ?? peer.role) === role).length;
}

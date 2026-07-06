import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useListDevices } from "@workspace/api-client-react";
import { AlertCircle, Building2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth-provider";
import { useLocation } from "wouter";
import {
  useBgpAnnouncementMatrixLatest,
  useBgpRegistryActions,
  useBgpRegistryAnnouncementState,
  useBgpRegistryConnections,
  useBgpRegistryCustomers,
  useBgpRegistryExitPoints,
  useBgpRegistryPrefixes,
  useBgpRegistryReconcile,
  useBgpRegistryPreview,
  useCreateBgpRegistryEntity,
  useDeleteBgpRegistryEntity,
  usePatchBgpRegistryEntity,
} from "@/features/bgp-registry/bgp-registry-api";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

type EditTarget =
  | { kind: "customer"; id: number; data: Record<string, unknown> }
  | { kind: "connection"; id: number; data: Record<string, unknown> }
  | { kind: "prefix"; id: number; data: Record<string, unknown> }
  | { kind: "exit"; id: number; data: Record<string, unknown> }
  | { kind: "action"; id: number; data: Record<string, unknown> }
  | null;

export default function BgpCustomersPage() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const { data: devices } = useListDevices();
  const customersQuery = useBgpRegistryCustomers();
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [familyFilter, setFamilyFilter] = useState("all");
  const [previewState, setPreviewState] = useState("P2");
  const [previewSelection, setPreviewSelection] = useState<{ rowIndex: number; exitIndex: number }>({ rowIndex: 0, exitIndex: 0 });
  const selectedCustomer = useMemo(() => customersQuery.data?.find((item) => item.id === customerId) ?? customersQuery.data?.[0] ?? null, [customersQuery.data, customerId]);
  const connectionsQuery = useBgpRegistryConnections(selectedCustomer?.id ?? null);
  const prefixesQuery = useBgpRegistryPrefixes(selectedCustomer?.id ?? null);
  const exitPointsQuery = useBgpRegistryExitPoints();
  const actionsQuery = useBgpRegistryActions(exitPointsQuery.data?.[0]?.id ? Number(exitPointsQuery.data[0].id) : null);
  const stateQuery = useBgpRegistryAnnouncementState(selectedCustomer?.id ?? null);
  const reconcileQuery = useBgpRegistryReconcile(selectedCustomer?.id ?? null);
  const availableDeviceIds = useMemo(() => Array.from(new Set((connectionsQuery.data ?? []).map((item) => Number(item.deviceId)).filter((item) => Number.isFinite(item) && item > 0))), [connectionsQuery.data]);
  const matrixDeviceId = selectedDeviceId ?? availableDeviceIds[0] ?? null;
  const matrixQuery = useBgpAnnouncementMatrixLatest(matrixDeviceId);
  const selectedDevice = useMemo(() => devices?.find((device) => device.id === matrixDeviceId) ?? null, [devices, matrixDeviceId]);
  const previewQueryDynamic = useBgpRegistryPreview(selectedCustomer?.id ?? null, matrixDeviceId, previewState, previewSelection.rowIndex, previewSelection.exitIndex);

  useEffect(() => {
    if (!loading && !user) setLocation("/login", { replace: true });
  }, [loading, setLocation, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawCustomerId = params.get("customerId");
    const rawDeviceId = params.get("deviceId");
    const rawFamily = params.get("family");
    const rawPreviewState = params.get("previewState");
    const rawRowIndex = params.get("rowIndex");
    const rawExitIndex = params.get("exitIndex");
    if (rawCustomerId && Number.isInteger(Number(rawCustomerId))) setCustomerId(Number(rawCustomerId));
    if (rawDeviceId && Number.isInteger(Number(rawDeviceId))) setSelectedDeviceId(Number(rawDeviceId));
    if (rawFamily) setFamilyFilter(rawFamily);
    if (rawPreviewState) setPreviewState(rawPreviewState);
    if (rawRowIndex && Number.isInteger(Number(rawRowIndex))) setPreviewSelection((current) => ({ ...current, rowIndex: Number(rawRowIndex) }));
    if (rawExitIndex && Number.isInteger(Number(rawExitIndex))) setPreviewSelection((current) => ({ ...current, exitIndex: Number(rawExitIndex) }));
  }, []);

  useEffect(() => {
    if (selectedDeviceId != null) return;
    if (availableDeviceIds.length > 0) setSelectedDeviceId(availableDeviceIds[0] ?? null);
  }, [availableDeviceIds, selectedDeviceId]);

  useEffect(() => {
    if (selectedDeviceId == null) return;
    if (availableDeviceIds.length > 0 && !availableDeviceIds.includes(selectedDeviceId)) setSelectedDeviceId(availableDeviceIds[0] ?? null);
  }, [availableDeviceIds, selectedDeviceId]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedCustomer?.id) url.searchParams.set("customerId", String(selectedCustomer.id)); else url.searchParams.delete("customerId");
    if (matrixDeviceId) url.searchParams.set("deviceId", String(matrixDeviceId)); else url.searchParams.delete("deviceId");
    if (familyFilter !== "all") url.searchParams.set("family", familyFilter); else url.searchParams.delete("family");
    if (previewState !== "P2") url.searchParams.set("previewState", previewState); else url.searchParams.delete("previewState");
    if (previewSelection.rowIndex > 0) url.searchParams.set("rowIndex", String(previewSelection.rowIndex)); else url.searchParams.delete("rowIndex");
    if (previewSelection.exitIndex > 0) url.searchParams.set("exitIndex", String(previewSelection.exitIndex)); else url.searchParams.delete("exitIndex");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [familyFilter, matrixDeviceId, previewSelection.exitIndex, previewSelection.rowIndex, previewState, selectedCustomer?.id]);

  const createCustomer = useCreateBgpRegistryEntity("/api/bgp/registry/customers", [["bgp-registry", "customers"]]);
  const deleteCustomer = useDeleteBgpRegistryEntity((id) => `/api/bgp/registry/customers/${id}`, [["bgp-registry", "customers"]]);
  const patchCustomer = usePatchBgpRegistryEntity((id) => `/api/bgp/registry/customers/${id}`, [["bgp-registry", "customers"], ["bgp-registry", "state", selectedCustomer?.id ?? null], ["bgp-registry", "reconcile", selectedCustomer?.id ?? null]]);

  const createConnection = useCreateBgpRegistryEntity("/api/bgp/registry/connections", [["bgp-registry", "connections", selectedCustomer?.id ?? null], ["bgp-registry", "state", selectedCustomer?.id ?? null], ["bgp-registry", "reconcile", selectedCustomer?.id ?? null]]);
  const patchConnection = usePatchBgpRegistryEntity((id) => `/api/bgp/registry/connections/${id}`, [["bgp-registry", "connections", selectedCustomer?.id ?? null], ["bgp-registry", "state", selectedCustomer?.id ?? null], ["bgp-registry", "reconcile", selectedCustomer?.id ?? null]]);
  const deleteConnection = useDeleteBgpRegistryEntity((id) => `/api/bgp/registry/connections/${id}`, [["bgp-registry", "connections", selectedCustomer?.id ?? null], ["bgp-registry", "state", selectedCustomer?.id ?? null], ["bgp-registry", "reconcile", selectedCustomer?.id ?? null]]);

  const createPrefix = useCreateBgpRegistryEntity("/api/bgp/registry/prefixes", [["bgp-registry", "prefixes", selectedCustomer?.id ?? null], ["bgp-registry", "state", selectedCustomer?.id ?? null], ["bgp-registry", "reconcile", selectedCustomer?.id ?? null]]);
  const patchPrefix = usePatchBgpRegistryEntity((id) => `/api/bgp/registry/prefixes/${id}`, [["bgp-registry", "prefixes", selectedCustomer?.id ?? null], ["bgp-registry", "state", selectedCustomer?.id ?? null], ["bgp-registry", "reconcile", selectedCustomer?.id ?? null]]);
  const deletePrefix = useDeleteBgpRegistryEntity((id) => `/api/bgp/registry/prefixes/${id}`, [["bgp-registry", "prefixes", selectedCustomer?.id ?? null], ["bgp-registry", "state", selectedCustomer?.id ?? null], ["bgp-registry", "reconcile", selectedCustomer?.id ?? null]]);

  const createExit = useCreateBgpRegistryEntity("/api/bgp/registry/exit-points", [["bgp-registry", "exit-points"]]);
  const patchExit = usePatchBgpRegistryEntity((id) => `/api/bgp/registry/exit-points/${id}`, [["bgp-registry", "exit-points"]]);
  const deleteExit = useDeleteBgpRegistryEntity((id) => `/api/bgp/registry/exit-points/${id}`, [["bgp-registry", "exit-points"]]);

  const createAction = useCreateBgpRegistryEntity("/api/bgp/registry/community-actions", [["bgp-registry", "actions", exitPointsQuery.data?.[0]?.id ? Number(exitPointsQuery.data[0].id) : null]]);
  const patchAction = usePatchBgpRegistryEntity((id) => `/api/bgp/registry/community-actions/${id}`, [["bgp-registry", "actions", exitPointsQuery.data?.[0]?.id ? Number(exitPointsQuery.data[0].id) : null]]);
  const deleteAction = useDeleteBgpRegistryEntity((id) => `/api/bgp/registry/community-actions/${id}`, [["bgp-registry", "actions", exitPointsQuery.data?.[0]?.id ? Number(exitPointsQuery.data[0].id) : null]]);

  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});

  const [customerForm, setCustomerForm] = useState({ name: "", code: "", asn: "", type: "customer", status: "active", notes: "" });
  const [connectionForm, setConnectionForm] = useState({ customerId: "", deviceId: "", addressFamily: "ipv4", neighborIpv4: "", neighborIpv6: "", interfaceName: "", vrfName: "", importRoutePolicy: "", exportRoutePolicy: "", originRoutePolicy: "", ipv4PrefixList: "", ipv6PrefixList: "", status: "active", source: "manual", notes: "" });
  const [prefixForm, setPrefixForm] = useState({ customerId: "", connectionId: "", prefix: "", addressFamily: "ipv4", originAsn: "", maxPrefixLength: "", source: "manual", validationStatus: "active", description: "" });
  const [exitForm, setExitForm] = useState({ name: "", slug: "", type: "upstream", asn: "", circuitId: "", deviceId: "", neighborIpv4: "", neighborIpv6: "", exportRoutePolicy: "", status: "active", displayOrder: "0", notes: "" });
  const [actionForm, setActionForm] = useState({ exitPointId: "", action: "On", community: "", label: "", riskLevel: "low", addressFamily: "ipv4", enabled: true, description: "" });

  const labelsByCommunity = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of stateQuery.data?.actions ?? []) map.set(String((item as Record<string, unknown>).community), String((item as Record<string, unknown>).friendlyLabel ?? item.label ?? item.action));
    return map;
  }, [stateQuery.data?.actions]);
  const filteredMatrixRows = useMemo(
    () => (matrixQuery.data?.rows ?? []).filter((row) => familyFilter === "all" || String(row.family) === familyFilter),
    [familyFilter, matrixQuery.data?.rows],
  );
  const selectedMatrixRow = filteredMatrixRows[previewSelection.rowIndex] ?? filteredMatrixRows[0] ?? null;
  const selectedMatrixExit = matrixQuery.data?.columns?.[previewSelection.exitIndex] ?? matrixQuery.data?.columns?.[0] ?? null;

  const onCustomerCreate = async () => { await createCustomer.mutateAsync({ ...customerForm, asn: Number(customerForm.asn) }); setCustomerForm({ name: "", code: "", asn: "", type: "customer", status: "active", notes: "" }); };
  const onConnectionCreate = async () => { await createConnection.mutateAsync({ ...connectionForm, customerId: Number(connectionForm.customerId), deviceId: Number(connectionForm.deviceId) }); setConnectionForm((v) => ({ ...v, neighborIpv4: "", neighborIpv6: "", interfaceName: "", vrfName: "" })); };
  const onPrefixCreate = async () => { await createPrefix.mutateAsync({ ...prefixForm, customerId: Number(prefixForm.customerId), connectionId: prefixForm.connectionId ? Number(prefixForm.connectionId) : null, originAsn: prefixForm.originAsn ? Number(prefixForm.originAsn) : null, maxPrefixLength: prefixForm.maxPrefixLength ? Number(prefixForm.maxPrefixLength) : null }); setPrefixForm((v) => ({ ...v, prefix: "", description: "" })); };
  const onExitCreate = async () => { await createExit.mutateAsync({ ...exitForm, asn: exitForm.asn ? Number(exitForm.asn) : null, deviceId: exitForm.deviceId ? Number(exitForm.deviceId) : null, displayOrder: Number(exitForm.displayOrder) }); setExitForm((v) => ({ ...v, name: "", slug: "", circuitId: "" })); };
  const onActionCreate = async () => { await createAction.mutateAsync({ ...actionForm, exitPointId: Number(actionForm.exitPointId) }); setActionForm((v) => ({ ...v, community: "", label: "" })); };

  const editSave = async () => {
    if (!editTarget) return;
    const { kind, id, data } = editTarget;
    if (kind === "customer") await patchCustomer.mutateAsync({ id, body: editForm });
    if (kind === "connection") await patchConnection.mutateAsync({ id, body: editForm });
    if (kind === "prefix") await patchPrefix.mutateAsync({ id, body: editForm });
    if (kind === "exit") await patchExit.mutateAsync({ id, body: editForm });
    if (kind === "action") await patchAction.mutateAsync({ id, body: editForm });
    setEditTarget(null);
  };

  if (loading) {
    return <div className="p-0">Carregando...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Building2 className="h-6 w-6 text-primary" />Gestão de Anúncios BGP</h1>
          <p className="text-sm text-muted-foreground mt-1">Cadastro + operação. Engine continua em `/bgp/announcements`.</p>
        </div>
        <Button variant="outline" onClick={() => void customersQuery.refetch()}><RefreshCw className="h-4 w-4 mr-2" />Atualizar</Button>
      </div>

      {(customersQuery.error || stateQuery.error || matrixQuery.error || reconcileQuery.error) && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Falha</AlertTitle><AlertDescription>Erro de leitura do registry ou matriz.</AlertDescription></Alert>}

      <Card>
        <CardHeader><CardTitle className="text-base">Cliente</CardTitle><CardDescription>Seleção orienta matriz e cadastro.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Select value={selectedCustomer ? String(selectedCustomer.id) : ""} onValueChange={(value) => setCustomerId(Number(value))}>
            <SelectTrigger><SelectValue placeholder="Escolha cliente" /></SelectTrigger>
            <SelectContent>{customersQuery.data?.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name} · ASN {item.asn}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2">{selectedCustomer && (<><Badge variant="secondary">{selectedCustomer.code}</Badge><Badge variant="outline">{selectedCustomer.status}</Badge><Badge variant="outline">ASN {selectedCustomer.asn}</Badge></>)}</div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList><TabsTrigger value="overview">Visão geral</TabsTrigger><TabsTrigger value="customers">Clientes</TabsTrigger><TabsTrigger value="connections">Conexões</TabsTrigger><TabsTrigger value="prefixes">Prefixos</TabsTrigger><TabsTrigger value="exits">Saídas</TabsTrigger></TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-5">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Conexões</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stateQuery.data?.connections.length ?? 0}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Prefixos</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stateQuery.data?.prefixes.length ?? 0}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Saídas</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stateQuery.data?.exitPoints.length ?? 0}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Mismatches</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{reconcileQuery.data?.mismatchCount ?? 0}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Preview</CardTitle></CardHeader><CardContent className="text-sm font-semibold">{String(previewQueryDynamic.data?.desiredState ?? "P2")}</CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3"><Field label="AF"><Select value={familyFilter} onValueChange={setFamilyFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="ipv4">IPv4</SelectItem><SelectItem value="ipv6">IPv6</SelectItem></SelectContent></Select></Field><Field label="Preview state"><Select value={previewState} onValueChange={setPreviewState}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="On">On</SelectItem><SelectItem value="P1">P1</SelectItem><SelectItem value="P2">P2</SelectItem><SelectItem value="P3">P3</SelectItem><SelectItem value="P4">P4</SelectItem><SelectItem value="Off">Off</SelectItem></SelectContent></Select></Field><Field label="Device"><Select value={String(matrixDeviceId ?? "")} onValueChange={(value) => setSelectedDeviceId(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{availableDeviceIds.map((deviceId) => <SelectItem key={deviceId} value={String(deviceId)}>{devices?.find((device) => device.id === deviceId)?.hostname ?? `Device ${deviceId}`}</SelectItem>)}</SelectContent></Select></Field><div className="md:col-span-3 text-xs text-muted-foreground">selected device: {selectedDevice?.hostname ?? (matrixDeviceId ? `Device ${matrixDeviceId}` : "-")}</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Preview target</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><Field label="Matrix row"><Select value={String(previewSelection.rowIndex)} onValueChange={(value) => setPreviewSelection((current) => ({ ...current, rowIndex: Number(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{filteredMatrixRows.slice(0, 20).map((row, index) => <SelectItem key={index} value={String(index)}>{row.prefixScope?.name ?? row.targetPolicyName ?? `row ${index}`}</SelectItem>)}</SelectContent></Select></Field><Field label="Exit"><Select value={String(previewSelection.exitIndex)} onValueChange={(value) => setPreviewSelection((current) => ({ ...current, exitIndex: Number(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{matrixQuery.data?.columns?.map((column, index) => <SelectItem key={column.key} value={String(index)}>{column.label}</SelectItem>)}</SelectContent></Select></Field><div className="md:col-span-2 text-sm text-muted-foreground">row: {String(selectedMatrixRow?.prefixScope?.name ?? selectedMatrixRow?.targetPolicyName ?? "-")} · exit: {String(selectedMatrixExit?.label ?? selectedMatrixExit?.upstreamName ?? "-")}</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Matriz operacional</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Prefixo</TableHead><TableHead>AF</TableHead><TableHead>Saídas</TableHead></TableRow></TableHeader><TableBody>{filteredMatrixRows.slice(0, 12).map((row, index) => <TableRow key={index}><TableCell className="font-mono text-xs">{row.prefixScope?.name ?? row.targetPolicyName ?? "-"}</TableCell><TableCell>{row.family}</TableCell><TableCell>{Object.values(row.cells ?? {}).map((cell: any) => labelsByCommunity.get(String(cell.community ?? "")) ?? cell.label ?? cell.state).join(" · ")}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Preview engine</CardTitle></CardHeader><CardContent className="space-y-2"><div className="text-sm">previewId: {String(previewQueryDynamic.data?.previewId ?? "-")}</div><div className="text-sm text-muted-foreground">target: {String(previewQueryDynamic.data?.targetPolicyName ?? "-")}</div><div className="text-sm text-muted-foreground">findings: {(previewQueryDynamic.data?.findings ?? []).length}</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Reconciliação</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Kind</TableHead><TableHead>Community</TableHead><TableHead>Label</TableHead><TableHead>Row</TableHead><TableHead>Exit</TableHead><TableHead>Message</TableHead></TableRow></TableHeader><TableBody>{(reconcileQuery.data?.mismatches ?? []).map((item, idx) => <TableRow key={idx}><TableCell>{item.kind}</TableCell><TableCell className="font-mono text-xs">{item.community ?? "-"}</TableCell><TableCell>{item.label ?? "-"}</TableCell><TableCell>{item.row ?? "-"}</TableCell><TableCell>{item.exit ?? "-"}</TableCell><TableCell>{item.message}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="customers"><Card><CardHeader><CardTitle className="text-base">Clientes</CardTitle></CardHeader><CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2"><Field label="Nome"><Input value={customerForm.name} onChange={(e) => setCustomerForm((v) => ({ ...v, name: e.target.value }))} /></Field><Field label="Código"><Input value={customerForm.code} onChange={(e) => setCustomerForm((v) => ({ ...v, code: e.target.value }))} /></Field></div>
            <div className="grid gap-3 md:grid-cols-3"><Field label="ASN"><Input value={customerForm.asn} onChange={(e) => setCustomerForm((v) => ({ ...v, asn: e.target.value }))} /></Field><Field label="Tipo"><Input value={customerForm.type} onChange={(e) => setCustomerForm((v) => ({ ...v, type: e.target.value }))} /></Field><Field label="Status"><Input value={customerForm.status} onChange={(e) => setCustomerForm((v) => ({ ...v, status: e.target.value }))} /></Field></div>
            <Field label="Notas"><Textarea value={customerForm.notes} onChange={(e) => setCustomerForm((v) => ({ ...v, notes: e.target.value }))} /></Field>
            <Button onClick={() => void onCustomerCreate()} disabled={createCustomer.isPending}><Plus className="h-4 w-4 mr-2" />Criar cliente</Button>
          </div>
          <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>ASN</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{customersQuery.data?.map((item) => <TableRow key={item.id}><TableCell>{item.name}</TableCell><TableCell>{item.asn}</TableCell><TableCell>{item.status}</TableCell><TableCell className="flex gap-2"><Button variant="ghost" size="icon" onClick={() => { setEditForm({ name: item.name, code: item.code, asn: item.asn, type: item.type, status: item.status, notes: item.notes ?? "" }); setEditTarget({ kind: "customer", id: item.id, data: { name: item.name, code: item.code, asn: item.asn, type: item.type, status: item.status, notes: item.notes ?? "" } }); }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => void deleteCustomer.mutateAsync(item.id)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table>
        </CardContent></Card></TabsContent>

        <TabsContent value="connections"><Card><CardHeader><CardTitle className="text-base">Conexões</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3"><Field label="Cliente"><Select value={connectionForm.customerId} onValueChange={(value) => setConnectionForm((v) => ({ ...v, customerId: value }))}><SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger><SelectContent>{customersQuery.data?.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Device"><Select value={connectionForm.deviceId} onValueChange={(value) => setConnectionForm((v) => ({ ...v, deviceId: value }))}><SelectTrigger><SelectValue placeholder="Device" /></SelectTrigger><SelectContent>{devices?.map((device) => <SelectItem key={device.id} value={String(device.id)}>{device.hostname}</SelectItem>)}</SelectContent></Select></Field><Field label="AF"><Input value={connectionForm.addressFamily} onChange={(e) => setConnectionForm((v) => ({ ...v, addressFamily: e.target.value }))} /></Field></div>
          <Button onClick={() => void onConnectionCreate()} disabled={createConnection.isPending}><Plus className="h-4 w-4 mr-2" />Criar conexão</Button>
          <Separator />
          <Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Cliente</TableHead><TableHead>Device</TableHead><TableHead>AF</TableHead><TableHead /></TableRow></TableHeader><TableBody>{connectionsQuery.data?.map((row) => <TableRow key={row.id}><TableCell>{row.id}</TableCell><TableCell>{String(row.customerId)}</TableCell><TableCell>{String(row.deviceId)}</TableCell><TableCell>{String(row.addressFamily)}</TableCell><TableCell className="flex gap-2"><Button variant="ghost" size="icon" onClick={() => { setEditForm(row); setEditTarget({ kind: "connection", id: row.id, data: row }); }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => void deleteConnection.mutateAsync(row.id)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table>
        </CardContent></Card></TabsContent>

        <TabsContent value="prefixes"><Card><CardHeader><CardTitle className="text-base">Prefixos</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-4"><Field label="Cliente"><Select value={prefixForm.customerId} onValueChange={(value) => setPrefixForm((v) => ({ ...v, customerId: value }))}><SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger><SelectContent>{customersQuery.data?.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Conexão"><Input value={prefixForm.connectionId} onChange={(e) => setPrefixForm((v) => ({ ...v, connectionId: e.target.value }))} /></Field><Field label="Prefixo"><Input value={prefixForm.prefix} onChange={(e) => setPrefixForm((v) => ({ ...v, prefix: e.target.value }))} /></Field><Field label="AF"><Input value={prefixForm.addressFamily} onChange={(e) => setPrefixForm((v) => ({ ...v, addressFamily: e.target.value }))} /></Field></div><Button onClick={() => void onPrefixCreate()} disabled={createPrefix.isPending}><Plus className="h-4 w-4 mr-2" />Criar prefixo</Button><Table><TableHeader><TableRow><TableHead>Prefixo</TableHead><TableHead>AF</TableHead><TableHead>Origem</TableHead><TableHead /></TableRow></TableHeader><TableBody>{prefixesQuery.data?.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-xs">{row.prefix}</TableCell><TableCell>{row.addressFamily}</TableCell><TableCell>{String(row.source ?? "-")}</TableCell><TableCell className="flex gap-2"><Button variant="ghost" size="icon" onClick={() => { setEditForm(row); setEditTarget({ kind: "prefix", id: row.id, data: row }); }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => void deletePrefix.mutateAsync(row.id)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>

        <TabsContent value="exits"><Card><CardHeader><CardTitle className="text-base">Saídas + communities</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><Field label="Nome"><Input value={exitForm.name} onChange={(e) => setExitForm((v) => ({ ...v, name: e.target.value }))} /></Field><Field label="Slug"><Input value={exitForm.slug} onChange={(e) => setExitForm((v) => ({ ...v, slug: e.target.value }))} /></Field><Field label="Circuito"><Input value={exitForm.circuitId} onChange={(e) => setExitForm((v) => ({ ...v, circuitId: e.target.value }))} /></Field></div><Button onClick={() => void onExitCreate()} disabled={createExit.isPending}><Plus className="h-4 w-4 mr-2" />Criar saída</Button><Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Slug</TableHead><TableHead>Circuito</TableHead><TableHead /></TableRow></TableHeader><TableBody>{exitPointsQuery.data?.map((row) => <TableRow key={row.id}><TableCell>{row.name}</TableCell><TableCell>{row.slug}</TableCell><TableCell>{String(row.circuitId ?? "-")}</TableCell><TableCell className="flex gap-2"><Button variant="ghost" size="icon" onClick={() => { setEditForm(row); setEditTarget({ kind: "exit", id: row.id, data: row }); }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => void deleteExit.mutateAsync(row.id)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table><Separator /><div className="grid gap-3 md:grid-cols-3"><Field label="Saída"><Select value={actionForm.exitPointId} onValueChange={(value) => setActionForm((v) => ({ ...v, exitPointId: value }))}><SelectTrigger><SelectValue placeholder="Saída" /></SelectTrigger><SelectContent>{exitPointsQuery.data?.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Ação"><Input value={actionForm.action} onChange={(e) => setActionForm((v) => ({ ...v, action: e.target.value }))} /></Field><Field label="Community"><Input value={actionForm.community} onChange={(e) => setActionForm((v) => ({ ...v, community: e.target.value }))} /></Field></div><Button onClick={() => void onActionCreate()} disabled={createAction.isPending}><Plus className="h-4 w-4 mr-2" />Criar community action</Button><Table><TableHeader><TableRow><TableHead>Ação</TableHead><TableHead>Community</TableHead><TableHead>Label</TableHead><TableHead /></TableRow></TableHeader><TableBody>{actionsQuery.data?.map((row) => <TableRow key={row.id}><TableCell>{row.action}</TableCell><TableCell className="font-mono text-xs">{row.community}</TableCell><TableCell>{String(row.label ?? "-")}</TableCell><TableCell className="flex gap-2"><Button variant="ghost" size="icon" onClick={() => { setEditForm(row); setEditTarget({ kind: "action", id: row.id, data: row }); }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => void deleteAction.mutateAsync(row.id)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
      </Tabs>

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar registro</DialogTitle></DialogHeader>
          {editTarget && (
            <div className="space-y-3">
              <div className="grid gap-3">
                {editTarget.kind === "customer" && (
                  <>
                    <Field label="Nome"><Input value={String(editForm.name ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, name: e.target.value }))} /></Field>
                    <Field label="Código"><Input value={String(editForm.code ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, code: e.target.value }))} /></Field>
                    <Field label="ASN"><Input value={String(editForm.asn ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, asn: Number(e.target.value) }))} /></Field>
                    <Field label="Tipo"><Input value={String(editForm.type ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, type: e.target.value }))} /></Field>
                    <Field label="Status"><Input value={String(editForm.status ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, status: e.target.value }))} /></Field>
                    <Field label="Notas"><Textarea value={String(editForm.notes ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, notes: e.target.value }))} /></Field>
                  </>
                )}
                {editTarget.kind === "connection" && (
                  <>
                    <Field label="Device ID"><Input value={String(editForm.deviceId ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, deviceId: Number(e.target.value) }))} /></Field>
                    <Field label="Customer ID"><Input value={String(editForm.customerId ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, customerId: Number(e.target.value) }))} /></Field>
                    <Field label="AF"><Input value={String(editForm.addressFamily ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, addressFamily: e.target.value }))} /></Field>
                    <Field label="Neighbor IPv4"><Input value={String(editForm.neighborIpv4 ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, neighborIpv4: e.target.value }))} /></Field>
                    <Field label="Neighbor IPv6"><Input value={String(editForm.neighborIpv6 ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, neighborIpv6: e.target.value }))} /></Field>
                    <Field label="Route-policy export"><Input value={String(editForm.exportRoutePolicy ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, exportRoutePolicy: e.target.value }))} /></Field>
                  </>
                )}
                {editTarget.kind === "prefix" && (
                  <>
                    <Field label="Prefixo"><Input value={String(editForm.prefix ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, prefix: e.target.value }))} /></Field>
                    <Field label="AF"><Input value={String(editForm.addressFamily ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, addressFamily: e.target.value }))} /></Field>
                    <Field label="ASN origem"><Input value={String(editForm.originAsn ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, originAsn: Number(e.target.value) }))} /></Field>
                    <Field label="Status"><Input value={String(editForm.validationStatus ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, validationStatus: e.target.value }))} /></Field>
                    <Field label="Descrição"><Textarea value={String(editForm.description ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, description: e.target.value }))} /></Field>
                  </>
                )}
                {editTarget.kind === "exit" && (
                  <>
                    <Field label="Nome"><Input value={String(editForm.name ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, name: e.target.value }))} /></Field>
                    <Field label="Slug"><Input value={String(editForm.slug ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, slug: e.target.value }))} /></Field>
                    <Field label="Circuit ID"><Input value={String(editForm.circuitId ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, circuitId: e.target.value }))} /></Field>
                    <Field label="Status"><Input value={String(editForm.status ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, status: e.target.value }))} /></Field>
                  </>
                )}
                {editTarget.kind === "action" && (
                  <>
                    <Field label="Label"><Input value={String(editForm.label ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, label: e.target.value }))} /></Field>
                    <Field label="Community"><Input value={String(editForm.community ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, community: e.target.value }))} /></Field>
                    <Field label="Risk"><Input value={String(editForm.riskLevel ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, riskLevel: e.target.value }))} /></Field>
                    <Field label="Enabled"><Input value={String(editForm.enabled ?? "")} onChange={(e) => setEditForm((v) => ({ ...v, enabled: e.target.value === "true" }))} /></Field>
                  </>
                )}
              </div>
              <Button onClick={() => void editSave()}>Salvar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

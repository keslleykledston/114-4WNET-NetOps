import { useMemo, useState } from "react";
import {
  getListComplianceFindingsQueryKey,
  getListComplianceJobsQueryKey,
  useCreateComplianceJob,
  useGetComplianceFindingsFreshnessSummary,
  useGetComplianceSummary,
  useListComplianceFindings,
  useListComplianceFindingsGroups,
  useListComplianceJobs,
  useListDevices,
  type ComplianceFinding,
  type ComplianceFindingGroup,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle2, Clock, Eye, Plus, ShieldAlert, ShieldCheck, Filter, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";
import { ComplianceFindingGroupDrawer } from "@/features/compliance/compliance-finding-group-drawer";
import { ComplianceFindingGroupTable } from "@/features/compliance/compliance-finding-group-table";
import { OperationalCategoryBadge, operationalCategoryLabel } from "@/features/compliance/operational-category-badge";

const ALL_CONTEXTS = ["security", "ntp", "snmp", "interface", "bgp", "l2vpn", "l3vpn"];
const FILTER_ALL = "all";
const OPERATIONAL_CATEGORIES = ["BLOCKER_REAL", "RISCO_OPERACIONAL", "PADRONIZACAO", "CUSTOMIZACAO", "INFORMATIVO", "FALSO_POSITIVO"];
const ACTIONABLE_CATEGORIES = ["BLOCKER_REAL", "RISCO_OPERACIONAL", "PADRONIZACAO", "CUSTOMIZACAO"];
const POLICY_PROFILES = ["huawei-vrp-edge-balanced", "huawei-vrp-edge-strict", "huawei-vrp-observe-only"];
type ViewMode = "findings" | "groups";

function badgeClass(value: string | null | undefined) {
  if (value === "pass" || value === "passed" || value === "high") return "bg-green-500/10 text-green-400 border-green-500/20";
  if (value === "fail" || value === "failed" || value === "critical") return "bg-red-500/10 text-red-400 border-red-500/20";
  if (value === "warning" || value === "medium") return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  if (value === "unknown" || value === "low") return "bg-slate-500/10 text-slate-300 border-slate-500/20";
  return "bg-blue-500/10 text-blue-300 border-blue-500/20";
}

function param(value: string) {
  return value === FILTER_ALL ? undefined : value;
}

function freshnessLabel(value: string | null | undefined) {
  if (value === "current") return "Atual";
  if (value === "stale") return "Stale";
  if (value === "legacy") return "Legado";
  if (value === "superseded") return "Substituído";
  return "Sem versão";
}

function freshnessClass(value: string | null | undefined) {
  if (value === "current") return "bg-green-500/10 text-green-400 border-green-500/20";
  if (value === "stale") return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  if (value === "legacy") return "bg-red-500/10 text-red-300 border-red-500/20";
  if (value === "superseded") return "bg-slate-500/10 text-slate-300 border-slate-500/20";
  return "bg-slate-500/10 text-slate-300 border-slate-500/20";
}

interface GroupSummaryCardProps {
  title: string;
  description: string;
  groups: ComplianceFindingGroup[];
  emptyLabel: string;
  onSelectGroup: (group: ComplianceFindingGroup) => void;
}

function GroupSummaryCard({ title, description, groups, emptyLabel, onSelectGroup }: GroupSummaryCardProps) {
  const total = groups.reduce((sum, group) => sum + group.count, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-bold">{total}</div>
        {groups.length === 0 ? (
          <div className="text-xs text-muted-foreground">{emptyLabel}</div>
        ) : groups.map((group) => (
          <button
            key={`${title}-${group.ruleId}-${group.context}-${group.severity}-${group.operationalCategory}-${group.message}`}
            type="button"
            onClick={() => onSelectGroup(group)}
            className="block w-full rounded-md border bg-background p-2 text-left transition-colors hover:bg-muted"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs">{group.ruleId}</span>
              <Badge variant="secondary" className="shrink-0">{group.count}</Badge>
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{group.message}</div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

export default function Compliance() {
  const { user } = useAuth();
  const isOperator = user?.role === "operator" || user?.role === "admin";
  const { data: summary } = useGetComplianceSummary();
  const { data: freshnessSummary } = useGetComplianceFindingsFreshnessSummary();
  const { data: jobs, isLoading } = useListComplianceJobs();
  const { data: devices } = useListDevices();
  const createJob = useCreateComplianceJob();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [selectedContexts, setSelectedContexts] = useState<string[]>(["security", "bgp"]);
  const [selectedProfile, setSelectedProfile] = useState<string>("huawei-vrp-edge-balanced");
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL);
  const [severityFilter, setSeverityFilter] = useState(FILTER_ALL);
  const [contextFilter, setContextFilter] = useState(FILTER_ALL);
  const [confidenceFilter, setConfidenceFilter] = useState(FILTER_ALL);
  const [sourceFilter, setSourceFilter] = useState(FILTER_ALL);
  const [deviceFilter, setDeviceFilter] = useState(FILTER_ALL);
  const [operationalCategoryFilter, setOperationalCategoryFilter] = useState(FILTER_ALL);
  const [onlyActionable, setOnlyActionable] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("findings");
  const [selectedFinding, setSelectedFinding] = useState<ComplianceFinding | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ComplianceFindingGroup | null>(null);

  const findingParams = {
    status: param(statusFilter),
    severity: param(severityFilter),
    context: param(contextFilter),
    confidence: param(confidenceFilter),
    source: param(sourceFilter),
    operationalCategory: param(operationalCategoryFilter),
    latestJobOnly: !includeHistory,
    freshness: "all" as const,
    deviceId: deviceFilter === FILTER_ALL ? undefined : Number(deviceFilter),
  };
  const { data: allFindings, isLoading: findingsLoading } = useListComplianceFindings(findingParams);
  const { data: allGroups, isLoading: groupsLoading } = useListComplianceFindingsGroups(findingParams);

  const findings = allFindings?.filter((finding: ComplianceFinding) => {
    if (onlyActionable && !ACTIONABLE_CATEGORIES.includes(finding.operationalCategory || "")) return false;
    return true;
  });
  const groups = allGroups?.filter((group: ComplianceFindingGroup) => {
    if (onlyActionable && !ACTIONABLE_CATEGORIES.includes(group.operationalCategory || "")) return false;
    return true;
  });

  const topCriticalGroups = useMemo(() => (
    [...(groups ?? [])]
      .filter((group) => group.severity === "critical")
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
  ), [groups]);
  const topCountGroups = useMemo(() => [...(groups ?? [])].sort((a, b) => b.count - a.count).slice(0, 3), [groups]);
  const blockerGroups = useMemo(() => (
    [...(groups ?? [])]
      .filter((group) => group.operationalCategory === "BLOCKER_REAL")
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
  ), [groups]);
  const riskGroups = useMemo(() => (
    [...(groups ?? [])]
      .filter((group) => group.operationalCategory === "RISCO_OPERACIONAL")
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
  ), [groups]);

  const passFindings = findings?.filter((finding: ComplianceFinding) => (finding.status ?? finding.result) === "pass").length ?? 0;
  const failFindings = findings?.filter((finding: ComplianceFinding) => (finding.status ?? finding.result) === "fail").length ?? 0;
  const warningFindings = findings?.filter((finding: ComplianceFinding) => (finding.status ?? finding.result) === "warning").length ?? summary?.warningFindings ?? 0;
  const unknownFindings = findings?.filter((finding: ComplianceFinding) => (finding.status ?? finding.result) === "unknown").length ?? summary?.unknownFindings ?? 0;
  const criticalFindings = findings?.filter((finding: ComplianceFinding) => finding.severity === "critical").length ?? summary?.criticalFindings ?? 0;

  const handleCreate = () => {
    if (!isOperator) {
      toast({ title: "Forbidden", description: "Viewer não executa compliance.", variant: "destructive" });
      return;
    }
    if (!selectedDevice || selectedContexts.length === 0) {
      toast({ title: "Validation Error", description: "Select a device and at least one context.", variant: "destructive" });
      return;
    }

    createJob.mutate({
      data: {
        deviceId: Number(selectedDevice),
        contexts: selectedContexts,
        policyProfileName: selectedProfile,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListComplianceJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListComplianceFindingsQueryKey(findingParams) });
        setIsCreateOpen(false);
        setSelectedDevice("");
        setSelectedContexts(["security", "bgp"]);
        setSelectedProfile("huawei-vrp-edge-balanced");
        toast({ title: "Compliance job started" });
      },
    });
  };

  const toggleContext = (ctx: string) => {
    setSelectedContexts((prev) => prev.includes(ctx) ? prev.filter((item) => item !== ctx) : [...prev, ctx]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compliance</h1>
          <p className="text-muted-foreground mt-1">Checks estruturados com source, confidence e evidence sanitizada</p>
        </div>

        {isOperator && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Run Check
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Run Compliance Check</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Target Device</label>
                  <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                    <SelectTrigger><SelectValue placeholder="Select a device" /></SelectTrigger>
                    <SelectContent>
                      {devices?.map((device: any) => (
                        <SelectItem key={device.id} value={device.id.toString()}>{device.hostname} ({device.ipAddress})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Policy Profile</label>
                  <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                    <SelectTrigger><SelectValue placeholder="Select profile" /></SelectTrigger>
                    <SelectContent>
                      {POLICY_PROFILES.map((profile) => (
                        <SelectItem key={profile} value={profile}>{profile}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              <div className="space-y-2">
                  <label className="text-sm font-medium">Policy Contexts</label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {ALL_CONTEXTS.map((ctx) => (
                      <div key={ctx} className="flex items-center space-x-2">
                        <Checkbox id={`ctx-${ctx}`} checked={selectedContexts.includes(ctx)} onCheckedChange={() => toggleContext(ctx)} />
                        <label htmlFor={`ctx-${ctx}`} className="text-sm font-mono cursor-pointer">{ctx}</label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={createJob.isPending}>
                  {createJob.isPending ? "Starting..." : "Run Job"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">
        Compliance read-only. Confidence baixo/unknown vira warning/unknown quando evidência forte não existe. Execute discovery para melhorar confiança.
        {!includeHistory && (
          <span className="ml-2 text-amber-100">Mostrando somente o último job por device.</span>
        )}
      </div>

      {(freshnessSummary?.legacy || freshnessSummary?.stale) ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-200">
          Existem {freshnessSummary.legacy} findings legados e {freshnessSummary.stale} stale gerados antes da versão atual do parser/engine.
          Eles ficam ocultos por padrão e continuam acessíveis ao incluir histórico.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Current</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-green-400">{freshnessSummary?.current ?? 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Stale</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-amber-300">{freshnessSummary?.stale ?? 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Legacy</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-red-300">{freshnessSummary?.legacy ?? 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Superseded</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-slate-300">{freshnessSummary?.superseded ?? 0}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex justify-between">Pass <CheckCircle2 className="h-4 w-4 text-green-500" /></CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-400">{passFindings}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex justify-between">Fail <AlertCircle className="h-4 w-4 text-red-500" /></CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-400">{failFindings}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex justify-between">Warning <ShieldAlert className="h-4 w-4 text-amber-400" /></CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-300">{warningFindings}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex justify-between">Unknown <Clock className="h-4 w-4 text-slate-400" /></CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-slate-300">{unknownFindings}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex justify-between">Critical <ShieldCheck className="h-4 w-4 text-red-500" /></CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-400">{criticalFindings}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <GroupSummaryCard
          title="Top grupos críticos"
          description="Critical agrupado por regra"
          groups={topCriticalGroups}
          emptyLabel="Sem grupos críticos"
          onSelectGroup={setSelectedGroup}
        />
        <GroupSummaryCard
          title="Top grupos por quantidade"
          description="Maior volume filtrado"
          groups={topCountGroups}
          emptyLabel="Sem grupos"
          onSelectGroup={setSelectedGroup}
        />
        <GroupSummaryCard
          title="Blockers reais"
          description="Bloqueadores reais acionáveis"
          groups={blockerGroups}
          emptyLabel="Sem bloqueadores reais"
          onSelectGroup={setSelectedGroup}
        />
        <GroupSummaryCard
          title="Riscos operacionais"
          description="Riscos que afetam operação"
          groups={riskGroups}
          emptyLabel="Sem riscos operacionais"
          onSelectGroup={setSelectedGroup}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Finding Filters</CardTitle>
              <CardDescription>Filtra por status, severidade, contexto, confidence, source, device e categoria operacional</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={includeHistory ? "default" : "outline"}
                size="sm"
                onClick={() => setIncludeHistory(!includeHistory)}
              >
                Incluir histórico
              </Button>
              <Button
                variant={onlyActionable ? "default" : "outline"}
                size="sm"
                onClick={() => setOnlyActionable(!onlyActionable)}
                className="gap-2"
              >
                <Filter className="h-4 w-4" />
                Actionable Only
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-7 gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent>{[FILTER_ALL, "pass", "fail", "warning", "unknown"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}><SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger><SelectContent>{[FILTER_ALL, "critical", "high", "medium", "low", "info"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
          <Select value={contextFilter} onValueChange={setContextFilter}><SelectTrigger><SelectValue placeholder="Context" /></SelectTrigger><SelectContent>{[FILTER_ALL, ...ALL_CONTEXTS].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
          <Select value={confidenceFilter} onValueChange={setConfidenceFilter}><SelectTrigger><SelectValue placeholder="Confidence" /></SelectTrigger><SelectContent>{[FILTER_ALL, "high", "medium", "low", "unknown"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}><SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger><SelectContent>{[FILTER_ALL, "ssh_live", "ssh_running_config", "snmp_snapshot", "cached_config", "discovery_snapshot", "local_db"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
          <Select value={operationalCategoryFilter} onValueChange={setOperationalCategoryFilter}><SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value={FILTER_ALL}>all</SelectItem>{OPERATIONAL_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{operationalCategoryLabel(item)}</SelectItem>)}</SelectContent></Select>
          <Select value={deviceFilter} onValueChange={setDeviceFilter}><SelectTrigger><SelectValue placeholder="Device" /></SelectTrigger><SelectContent><SelectItem value={FILTER_ALL}>all</SelectItem>{devices?.map((device: any) => <SelectItem key={device.id} value={String(device.id)}>{device.hostname}</SelectItem>)}</SelectContent></Select>
        </CardContent>
      </Card>

      <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="findings">Lista de findings</TabsTrigger>
            <TabsTrigger value="groups">Grupos de findings</TabsTrigger>
          </TabsList>
          <div className="text-xs text-muted-foreground">
            {findings?.length ?? 0} findings · {groups?.length ?? 0} grupos
          </div>
        </div>

        <TabsContent value="findings">
          <Card>
            <CardHeader>
              <CardTitle>Findings</CardTitle>
              <CardDescription>Achados enriquecidos por source/confidence</CardDescription>
            </CardHeader>
            <div className="border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Context</TableHead>
                    <TableHead>Objeto</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Freshness</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {findingsLoading ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8">Loading...</TableCell></TableRow>
                  ) : findings?.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No findings.</TableCell></TableRow>
                  ) : findings?.map((finding: ComplianceFinding) => (
                    <TableRow key={finding.id}>
                      <TableCell><Badge variant="outline" className={badgeClass(finding.severity)}>{finding.severity}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className={badgeClass(finding.status ?? finding.result)}>{finding.status ?? finding.result}</Badge></TableCell>
                      <TableCell><OperationalCategoryBadge value={finding.operationalCategory} /></TableCell>
                      <TableCell className="font-mono text-xs">{finding.context}</TableCell>
                      <TableCell>
                        <div className="text-sm">{finding.objectName ?? finding.deviceHostname ?? "-"}</div>
                        <div className="text-[11px] text-muted-foreground">{finding.objectType ?? "device"}</div>
                      </TableCell>
                      <TableCell className="max-w-[420px] truncate">{finding.message ?? finding.detail ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{finding.source ?? "-"}</TableCell>
                      <TableCell><Badge variant="outline" className={badgeClass(finding.confidence)}>{finding.confidence ?? "-"}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className={freshnessClass(finding.freshness)}>{freshnessLabel(finding.freshness)}</Badge></TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedFinding(finding)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="groups">
          <Card>
            <CardHeader>
              <CardTitle>Grupos de findings</CardTitle>
              <CardDescription>Agregação por ruleId, contexto, severidade, categoria operacional e mensagem normalizada</CardDescription>
            </CardHeader>
            <ComplianceFindingGroupTable
              groups={groups}
              isLoading={groupsLoading}
              badgeClass={badgeClass}
              onSelectGroup={setSelectedGroup}
            />
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Compliance Job History</CardTitle>
          <CardDescription>Recent policy evaluation runs</CardDescription>
        </CardHeader>
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Target Device</TableHead>
                <TableHead>Policy Profile</TableHead>
                <TableHead>Contexts</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Findings</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : jobs?.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No compliance jobs found.</TableCell></TableRow>
              ) : jobs?.map((job: any) => (
                <TableRow key={job.id}>
                  <TableCell className="font-mono text-sm">#{job.id}</TableCell>
                  <TableCell className="font-medium">{job.deviceHostname}</TableCell>
                  <TableCell className="font-mono text-xs"><Badge variant="outline">{job.policyProfileName ?? "balanced"}</Badge></TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{job.contexts.map((ctx: string) => <Badge key={ctx} variant="secondary" className="text-[10px] font-mono">{ctx}</Badge>)}</div></TableCell>
                  <TableCell><Badge variant="outline" className={badgeClass(job.status)}>{job.status}</Badge></TableCell>
                  <TableCell><div className="text-xs"><span className="text-green-500 mr-2">{job.passCount} pass</span><span className="text-red-500">{job.failCount} fail</span></div></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{job.completedAt ? new Date(job.completedAt).toLocaleString() : "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const url = `/api/compliance/jobs/${job.id}/report/download?format=markdown`;
                        window.location.href = url;
                      }}
                      title="Download report"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!selectedFinding} onOpenChange={(open) => !open && setSelectedFinding(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Finding Details</DialogTitle>
          </DialogHeader>
          {selectedFinding && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                <div><div className="text-muted-foreground">Status</div><Badge variant="outline" className={badgeClass(selectedFinding.status ?? selectedFinding.result)}>{selectedFinding.status ?? selectedFinding.result}</Badge></div>
                <div><div className="text-muted-foreground">Severity</div><Badge variant="outline" className={badgeClass(selectedFinding.severity)}>{selectedFinding.severity}</Badge></div>
                <div><div className="text-muted-foreground">Category</div><OperationalCategoryBadge value={selectedFinding.operationalCategory} /></div>
                <div><div className="text-muted-foreground">Source</div><div className="font-mono text-xs">{selectedFinding.source ?? "-"}</div></div>
                <div><div className="text-muted-foreground">Confidence</div><div className="font-mono text-xs">{selectedFinding.confidence ?? "-"}</div></div>
                <div><div className="text-muted-foreground">Freshness</div><Badge variant="outline" className={freshnessClass(selectedFinding.freshness)}>{freshnessLabel(selectedFinding.freshness)}</Badge></div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Mensagem</div>
                <div>{selectedFinding.message ?? selectedFinding.detail ?? "-"}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Recommendation</div>
                <div>{selectedFinding.recommendation ?? "-"}</div>
              </div>
              <div className="rounded-md bg-muted p-3">
                <div className="text-sm text-muted-foreground mb-2">Evidence</div>
                <pre className="whitespace-pre-wrap text-xs">{selectedFinding.evidence ?? "Sem evidence sanitizada"}</pre>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Rule: {selectedFinding.ruleName ?? selectedFinding.policyName} {selectedFinding.ruleId ? `(${selectedFinding.ruleId})` : ""}</div>
                <div>Object: {selectedFinding.objectType ?? "-"} / {selectedFinding.objectId ?? "-"} ({selectedFinding.objectName ?? "-"})</div>
                <div>Engine/parser: {selectedFinding.complianceEngineVersion ?? "legacy"} / {selectedFinding.parserVersion ?? "legacy"}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ComplianceFindingGroupDrawer
        group={selectedGroup}
        findings={findings ?? []}
        open={!!selectedGroup}
        onOpenChange={(open) => !open && setSelectedGroup(null)}
        badgeClass={badgeClass}
      />
    </div>
  );
}

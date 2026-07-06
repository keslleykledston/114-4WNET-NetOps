import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle2, Eye, Plus, ShieldCheck, Download, TrendingUp, Trash2 } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";
import {
  fetchComplianceDashboard,
  fetchComplianceDrifts,
  fetchDeviceCompliance,
  fetchDeviceDrifts,
  triggerComplianceRun,
  fetchBaselines,
  createBaseline,
  updateBaseline,
  deleteBaseline,
  fetchRules,
  updateRule,
  fetchTrends,
  type CreateBaselineInput,
} from "@/features/compliance/compliance-api";
import {
  useListComplianceFindingsGroups,
  useListComplianceJobs,
  useListDevices,
  useCreateComplianceJob,
  type ComplianceFinding,
  type ComplianceFindingGroup,
} from "@workspace/api-client-react";
import { ComplianceFindingGroupDrawer } from "@/features/compliance/compliance-finding-group-drawer";
import { ComplianceFindingGroupTable } from "@/features/compliance/compliance-finding-group-table";
import { OperationalCategoryBadge } from "@/features/compliance/operational-category-badge";
import { useTranslation } from "@/i18n";

export default function Compliance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";

  // Queries
  const { data: dashboard } = useQuery({
    queryKey: ["compliance-dashboard"],
    queryFn: fetchComplianceDashboard,
  });

  const { data: drifts } = useQuery({
    queryKey: ["compliance-drifts"],
    queryFn: () => fetchComplianceDrifts(),
  });

  const { data: jobs } = useListComplianceJobs();

  const { data: findings } = useListComplianceFindingsGroups();

  const { data: rules } = useQuery({
    queryKey: ["compliance-rules"],
    queryFn: fetchRules,
  });

  const { data: baselines } = useQuery({
    queryKey: ["compliance-baselines"],
    queryFn: () => fetchBaselines(),
  });

  const { data: trends } = useQuery({
    queryKey: ["compliance-trends"],
    queryFn: () => fetchTrends("global", undefined, 30),
  });

  // Mutations
  const updateRuleMutation = useMutation({
    mutationFn: ({ id, enabled, severity }: { id: number; enabled?: boolean; severity?: string }) =>
      updateRule(id, { enabled, severity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-rules"] });
      toast({ title: t("compliance.toastRuleUpdated") });
    },
  });

  const createBaselineMutation = useMutation({
    mutationFn: createBaseline,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-baselines"] });
      toast({ title: t("compliance.toastBaselineCreated") });
      setCreateBaselineOpen(false);
    },
  });

  const deleteBaselineMutation = useMutation({
    mutationFn: deleteBaseline,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-baselines"] });
      toast({ title: t("compliance.toastBaselineDeleted") });
    },
  });

  // Local state
  const [selectedGroup, setSelectedGroup] = useState<ComplianceFindingGroup | null>(null);
  const [createBaselineOpen, setCreateBaselineOpen] = useState(false);
  const [baselineForm, setBaselineForm] = useState<CreateBaselineInput>({
    scopeType: "GLOBAL",
    name: "",
  });

  const badgeClass = (value: string | null) => {
    if (value === "pass" || value === "passed") return "bg-green-500/10 text-green-400 border-green-500/20";
    if (value === "fail" || value === "failed") return "bg-red-500/10 text-red-400 border-red-500/20";
    if (value === "warning") return "bg-amber-500/10 text-amber-300 border-amber-500/20";
    return "bg-slate-500/10 text-slate-300 border-slate-500/20";
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="dashboard">{t("compliance.tabs.dashboard")}</TabsTrigger>
          <TabsTrigger value="findings">{t("compliance.tabs.findings")}</TabsTrigger>
          <TabsTrigger value="drifts">{t("compliance.tabs.drifts")}</TabsTrigger>
          <TabsTrigger value="runs">{t("compliance.tabs.runs")}</TabsTrigger>
          <TabsTrigger value="rules">{t("compliance.tabs.rules")}</TabsTrigger>
          <TabsTrigger value="baselines">{t("compliance.tabs.baselines")}</TabsTrigger>
          <TabsTrigger value="schedules">{t("compliance.tabs.schedules")}</TabsTrigger>
        </TabsList>

        {/* DASHBOARD TAB */}
        <TabsContent value="dashboard" className="space-y-6 mt-6">
          <div className="grid grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("compliance.metrics.pass")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500">{dashboard?.passed || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("compliance.metrics.fail")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">{dashboard?.failed || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("compliance.metrics.warning")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-500">{dashboard?.warningFindings || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("compliance.metrics.unknown")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-500">{dashboard?.unknownFindings || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("compliance.metrics.drift")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-500">{drifts?.length || 0}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Site Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("compliance.complianceBySite")}</CardTitle>
              </CardHeader>
              <CardContent>
                {dashboard?.siteAverages && Object.keys(dashboard.siteAverages).length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={Object.entries(dashboard.siteAverages).map(([site, score]) => ({
                        name: site,
                        score: Number(score),
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="score" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-muted-foreground text-sm">{t("compliance.noData")}</p>
                )}
              </CardContent>
            </Card>

            {/* Vendor Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("compliance.complianceByVendor")}</CardTitle>
              </CardHeader>
              <CardContent>
                {dashboard?.failuresByContext && Object.keys(dashboard.failuresByContext).length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={Object.entries(dashboard.failuresByContext).map(([context, count]) => ({
                        name: context,
                        failures: count,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="failures" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-muted-foreground text-sm">{t("compliance.noData")}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("compliance.trendEvolution")}</CardTitle>
            </CardHeader>
            <CardContent>
              {trends && trends.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="snapshotDate" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="score" stroke="#3b82f6" name={t("compliance.score")} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-sm">{t("compliance.noTrendData")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FINDINGS TAB */}
        <TabsContent value="findings" className="space-y-4 mt-6">
          {findings && findings.length > 0 ? (
            <ComplianceFindingGroupTable
              groups={findings}
              badgeClass={badgeClass}
              onSelectGroup={setSelectedGroup}
            />
          ) : (
            <p className="text-muted-foreground text-sm">{t("compliance.noFindingsTab")}</p>
          )}
        </TabsContent>

        {/* DRIFTS TAB */}
        <TabsContent value="drifts" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("compliance.configurationDrifts")}</CardTitle>
            </CardHeader>
            <CardContent>
              {drifts && drifts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("compliance.device")}</TableHead>
                      <TableHead>{t("compliance.driftSummary")}</TableHead>
                      <TableHead>{t("compliance.created")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drifts.map((drift) => (
                      <TableRow key={drift.id}>
                        <TableCell className="font-mono text-sm">#{drift.deviceId}</TableCell>
                        <TableCell className="max-w-md truncate text-sm">{drift.driftSummary || t("compliance.na")}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(drift.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-sm">{t("compliance.noDrifts")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* RUNS TAB */}
        <TabsContent value="runs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("compliance.complianceJobs")}</CardTitle>
            </CardHeader>
            <CardContent>
              {jobs && jobs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>{t("compliance.device")}</TableHead>
                      <TableHead>{t("compliance.status")}</TableHead>
                      <TableHead>{t("compliance.passFail")}</TableHead>
                      <TableHead>{t("compliance.completed")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-mono text-sm">#{job.id}</TableCell>
                        <TableCell>{job.deviceHostname}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={badgeClass(job.status)}>
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="text-green-500">{job.passCount}</span> / <span className="text-red-500">{job.failCount}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {job.completedAt ? new Date(job.completedAt).toLocaleString() : t("compliance.na")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-sm">{t("compliance.noJobs")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* RULES TAB */}
        <TabsContent value="rules" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("compliance.complianceRules")}</CardTitle>
              <CardDescription>{t("compliance.rulesDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {rules && rules.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("compliance.name")}</TableHead>
                      <TableHead>{t("compliance.context")}</TableHead>
                      <TableHead>{t("compliance.vendor")}</TableHead>
                      <TableHead>{t("compliance.severity")}</TableHead>
                      <TableHead>{t("compliance.enabled")}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="text-sm">{rule.name}</TableCell>
                        <TableCell className="text-xs">{rule.context}</TableCell>
                        <TableCell className="text-xs">{rule.vendor || t("compliance.any")}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={badgeClass(rule.severity)}>
                            {rule.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(e) =>
                              updateRuleMutation.mutate({
                                id: rule.id,
                                enabled: e.target.checked,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-sm">{t("compliance.noRules")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SCHEDULES TAB */}
        <TabsContent value="schedules" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("compliance.schedulesTitle")}</CardTitle>
              <CardDescription>{t("compliance.schedulesDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("compliance.schedulesApiHint")}</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BASELINES TAB */}
        <TabsContent value="baselines" className="space-y-4 mt-6">
          <div className="flex justify-end">
            <Dialog open={createBaselineOpen} onOpenChange={setCreateBaselineOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("compliance.newBaseline")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("compliance.createBaseline")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <select
                    value={baselineForm.scopeType}
                    onChange={(e) => setBaselineForm({ ...baselineForm, scopeType: e.target.value })}
                    className="w-full p-2 border rounded"
                  >
                    <option value="GLOBAL">GLOBAL</option>
                    <option value="SITE">SITE</option>
                    <option value="VENDOR">VENDOR</option>
                  </select>
                  {baselineForm.scopeType !== "GLOBAL" && (
                    <Input
                      placeholder={t("compliance.scopeIdPlaceholder")}
                      value={baselineForm.scopeId || ""}
                      onChange={(e) => setBaselineForm({ ...baselineForm, scopeId: e.target.value })}
                    />
                  )}
                  <Input
                    placeholder={t("compliance.name")}
                    value={baselineForm.name}
                    onChange={(e) => setBaselineForm({ ...baselineForm, name: e.target.value })}
                  />
                  <Textarea
                    placeholder={t("compliance.descriptionOptional")}
                    value={baselineForm.description || ""}
                    onChange={(e) => setBaselineForm({ ...baselineForm, description: e.target.value })}
                  />
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => createBaselineMutation.mutate(baselineForm)}
                    disabled={createBaselineMutation.isPending}
                  >
                    {t("compliance.create")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {baselines && baselines.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("compliance.name")}</TableHead>
                  <TableHead>{t("compliance.scope")}</TableHead>
                  <TableHead>{t("compliance.scopeId")}</TableHead>
                  <TableHead>{t("compliance.enabled")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {baselines.map((baseline) => (
                  <TableRow key={baseline.id}>
                    <TableCell className="font-medium">{baseline.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{baseline.scopeType}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{baseline.scopeId || "—"}</TableCell>
                    <TableCell>{baseline.enabled ? t("compliance.yes") : t("compliance.no")}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteBaselineMutation.mutate(baseline.id)}
                        disabled={deleteBaselineMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">{t("compliance.noBaselines")}</p>
          )}
        </TabsContent>
      </Tabs>

      <ComplianceFindingGroupDrawer
        group={selectedGroup}
        findings={[]}
        open={!!selectedGroup}
        onOpenChange={(open) => !open && setSelectedGroup(null)}
        badgeClass={badgeClass}
      />
    </div>
  );
}

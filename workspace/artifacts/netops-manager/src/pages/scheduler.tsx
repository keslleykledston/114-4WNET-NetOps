import { useEffect, useMemo, useState } from "react";
import {
  getGetScheduledJobRunQueryKey,
  getListScheduledJobRunsQueryKey,
  getListScheduledJobsQueryKey,
  type ScheduledJob,
  type ScheduledJobRun,
  type ScheduledJobRunDetail,
  useCreateScheduledJob,
  useDeleteScheduledJob,
  useDisableScheduledJob,
  useEnableScheduledJob,
  useGetScheduledJobRun,
  useListScheduledJobRuns,
  useListScheduledJobs,
  useRunScheduledJobNow,
  useUpdateScheduledJob,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, CheckCircle2, CircleSlash, Plus, RefreshCw, Rocket, Shield, ShieldAlert, Trash2 } from "lucide-react";

type JobFormState = {
  name: string;
  description: string;
  jobType: "discovery" | "compliance" | "health_check";
  targetType: "device" | "device_group" | "all_devices";
  targetId: string;
  contextsJson: string;
  cronExpression: string;
  intervalMinutes: string;
  maxRuntimeSeconds: string;
  enabled: boolean;
  runOnStartup: boolean;
};

const DEFAULT_CONTEXTS = JSON.stringify(["interfaces", "bgp", "l2vpn", "policies", "vrfs"], null, 2);

const EMPTY_FORM: JobFormState = {
  name: "",
  description: "",
  jobType: "discovery",
  targetType: "device",
  targetId: "",
  contextsJson: DEFAULT_CONTEXTS,
  cronExpression: "",
  intervalMinutes: "60",
  maxRuntimeSeconds: "3600",
  enabled: true,
  runOnStartup: false,
};

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function latestRunFor(jobId: number, runs: ScheduledJobRun[] | undefined) {
  return runs?.filter((run) => run.scheduledJobId === jobId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}

function countRuns(runs: ScheduledJobRun[] | undefined, status: string) {
  return runs?.filter((run) => run.status === status).length ?? 0;
}

function parseContexts(text: string): string[] {
  const parsed = JSON.parse(text || "[]");
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

function jobBadge(job: ScheduledJob) {
  if (!job.enabled) return <Badge variant="outline">Disabled</Badge>;
  return <Badge variant="default">Enabled</Badge>;
}

export default function SchedulerPage() {
  const { user } = useAuth();
  const canRun = user?.role === "admin" || user?.role === "operator";
  const canManage = user?.role === "admin";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: jobs, isLoading: jobsLoading } = useListScheduledJobs();
  const { data: runs } = useListScheduledJobRuns();

  const createJob = useCreateScheduledJob();
  const updateJob = useUpdateScheduledJob();
  const deleteJob = useDeleteScheduledJob();
  const runNow = useRunScheduledJobNow();
  const enableJob = useEnableScheduledJob();
  const disableJob = useDisableScheduledJob();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [form, setForm] = useState<JobFormState>(EMPTY_FORM);

  const selectedRunQuery = useGetScheduledJobRun(selectedRunId ?? 0, {
    query: { enabled: selectedRunId !== null, queryKey: getGetScheduledJobRunQueryKey(selectedRunId ?? 0) },
  });

  useEffect(() => {
    if (!editingJob) return;
    setForm({
      name: editingJob.name,
      description: editingJob.description ?? "",
      jobType: editingJob.jobType,
      targetType: editingJob.targetType,
      targetId: editingJob.targetId?.toString() ?? "",
      contextsJson: JSON.stringify(editingJob.contextsJson ?? [], null, 2),
      cronExpression: editingJob.cronExpression ?? "",
      intervalMinutes: String(editingJob.intervalMinutes ?? 60),
      maxRuntimeSeconds: String(editingJob.maxRuntimeSeconds ?? 3600),
      enabled: editingJob.enabled,
      runOnStartup: editingJob.runOnStartup,
    });
  }, [editingJob]);

  useEffect(() => {
    if (!createOpen) return;
    setForm((current) => {
      if (current.contextsJson.trim().length > 0) return current;
      return { ...current, contextsJson: DEFAULT_CONTEXTS };
    });
  }, [createOpen]);

  const recentRuns = useMemo(() => [...(runs ?? [])].slice(0, 8), [runs]);
  const activeJobs = jobs?.filter((job) => job.enabled).length ?? 0;
  const failedRuns = countRuns(runs, "failed");
  const nextRun = [...(jobs ?? [])]
    .filter((job) => job.nextRunAt)
    .sort((a, b) => new Date(a.nextRunAt ?? 0).getTime() - new Date(b.nextRunAt ?? 0).getTime())[0] ?? null;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListScheduledJobsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListScheduledJobRunsQueryKey() }),
      selectedRunId ? queryClient.invalidateQueries({ queryKey: getGetScheduledJobRunQueryKey(selectedRunId) }) : Promise.resolve(),
    ]);
  };

  const resetForm = () => setForm(EMPTY_FORM);

  const submitForm = () => {
    let contexts: string[] = [];
    try {
      contexts = parseContexts(form.contextsJson);
    } catch {
      toast({ title: "Contexts inválidos", description: "Use JSON array.", variant: "destructive" });
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      jobType: form.jobType,
      targetType: form.targetType,
      targetId: form.targetType === "all_devices" ? null : (form.targetId.trim() ? Number(form.targetId) : null),
      contextsJson: contexts,
      cronExpression: form.cronExpression.trim() || undefined,
      intervalMinutes: Number(form.intervalMinutes || 60),
      maxRuntimeSeconds: Number(form.maxRuntimeSeconds || 3600),
      enabled: form.enabled,
      runOnStartup: form.runOnStartup,
    };

    if (!payload.name || !payload.jobType || !payload.targetType) {
      toast({ title: "Campos obrigatórios faltando", variant: "destructive" });
      return;
    }

    if (editingJob) {
      updateJob.mutate({ id: editingJob.id, data: payload }, {
        onSuccess: async () => {
          await refresh();
          toast({ title: "Schedule atualizado" });
          setEditingJob(null);
        },
        onError: () => toast({ title: "Falha ao atualizar", variant: "destructive" }),
      });
      return;
    }

    createJob.mutate({ data: payload }, {
      onSuccess: async () => {
        await refresh();
        toast({ title: "Schedule criado" });
        setCreateOpen(false);
        resetForm();
      },
      onError: () => toast({ title: "Falha ao criar", variant: "destructive" }),
    });
  };

  const openCreate = () => {
    setEditingJob(null);
    setForm(EMPTY_FORM);
    setCreateOpen(true);
  };

  const openEdit = (job: ScheduledJob) => {
    setEditingJob(job);
    setCreateOpen(true);
  };

  const handleRunNow = (id: number) => {
    runNow.mutate({ id }, {
      onSuccess: async (result) => {
        await refresh();
        toast({ title: "Run executado", description: `Status: ${result.status}` });
        setSelectedRunId(result.id);
      },
      onError: () => toast({ title: "Falha no run-now", variant: "destructive" }),
    });
  };

  const handleToggle = (job: ScheduledJob) => {
    const mutation = job.enabled ? disableJob : enableJob;
    mutation.mutate({ id: job.id }, {
      onSuccess: async () => {
        await refresh();
        toast({ title: job.enabled ? "Schedule desabilitado" : "Schedule habilitado" });
      },
      onError: () => toast({ title: "Falha na alteração", variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm("Remover schedule?")) return;
    deleteJob.mutate({ id }, {
      onSuccess: async () => {
        await refresh();
        toast({ title: "Schedule removido" });
      },
      onError: () => toast({ title: "Falha ao remover", variant: "destructive" }),
    });
  };

  const selectedRun = selectedRunQuery.data ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scheduler</h1>
          <p className="mt-1 text-muted-foreground">Discovery, compliance and health jobs on a safe local loop.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New Schedule
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Jobs ativos" value={String(activeJobs)} icon={<CalendarClock className="h-4 w-4" />} />
        <StatCard title="Últimas execuções" value={String(recentRuns.length)} icon={<Rocket className="h-4 w-4" />} />
        <StatCard title="Falhas recentes" value={String(failedRuns)} icon={<ShieldAlert className="h-4 w-4" />} />
        <StatCard title="Próxima execução" value={nextRun?.nextRunAt ? formatDate(nextRun.nextRunAt) : "—"} icon={<Shield className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduled Jobs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Interval / Cron</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead>Next Run</TableHead>
                <TableHead>Last Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobsLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : !(jobs?.length) ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No schedules found.</TableCell>
                </TableRow>
              ) : jobs.map((job) => {
                const lastRun = latestRunFor(job.id, runs);
                return (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.name}</TableCell>
                    <TableCell>{job.jobType}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{job.targetLabel ?? `${job.targetType}${job.targetId ? ` #${job.targetId}` : ""}`}</TableCell>
                    <TableCell>{jobBadge(job)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.intervalMinutes}m{job.cronExpression ? <span className="block truncate">{job.cronExpression}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(job.lastRunAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(job.nextRunAt)}</TableCell>
                    <TableCell>
                      {lastRun ? (
                        <Badge variant={lastRun.status === "completed" ? "default" : lastRun.status === "partial" ? "secondary" : "destructive"}>
                          {lastRun.status}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canRun && (
                          <Button size="sm" variant="outline" onClick={() => handleRunNow(job.id)}>
                            Run now
                          </Button>
                        )}
                        {canManage && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openEdit(job)}>Edit</Button>
                            <Button size="sm" variant="outline" onClick={() => handleToggle(job)}>
                              {job.enabled ? <CircleSlash className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                              {job.enabled ? "Disable" : "Enable"}
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDelete(job.id)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          </>
                        )}
                        {lastRun && (
                          <Button size="sm" variant="ghost" onClick={() => setSelectedRunId(lastRun.id)}>
                            View run
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Triggered By</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!recentRuns.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No runs yet.</TableCell>
                </TableRow>
              ) : recentRuns.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(run.createdAt)}</TableCell>
                  <TableCell>#{run.scheduledJobId}</TableCell>
                  <TableCell><Badge variant="outline">{run.status}</Badge></TableCell>
                  <TableCell>{run.triggeredBy}</TableCell>
                  <TableCell className="max-w-[420px] truncate text-xs text-muted-foreground">{run.summaryJson ? JSON.stringify(run.summaryJson) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedRunId(run.id)}>Open</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditingJob(null); resetForm(); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingJob ? "Edit Schedule" : "New Schedule"}</DialogTitle>
          </DialogHeader>
          <ScheduleForm form={form} setForm={setForm} onSubmit={submitForm} pending={createJob.isPending || updateJob.isPending} />
        </DialogContent>
      </Dialog>

      <Dialog open={selectedRunId !== null} onOpenChange={(open) => !open && setSelectedRunId(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Run Details</DialogTitle>
          </DialogHeader>
          {selectedRun ? (
            <ScrollArea className="max-h-[72vh] pr-4">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3 text-sm">
                  <InfoBox label="Run ID" value={`#${selectedRun.id}`} />
                  <InfoBox label="Job ID" value={`#${selectedRun.scheduledJobId}`} />
                  <InfoBox label="Status" value={selectedRun.status} />
                  <InfoBox label="Triggered By" value={selectedRun.triggeredBy} />
                  <InfoBox label="Started" value={formatDate(selectedRun.startedAt)} />
                  <InfoBox label="Finished" value={formatDate(selectedRun.finishedAt)} />
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</div>
                  <pre className="overflow-x-auto rounded-md border bg-muted/20 p-4 text-xs leading-relaxed">
                    {JSON.stringify(selectedRun.summaryJson ?? {}, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Device</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ref</TableHead>
                        <TableHead>Summary</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedRun.items ?? []).map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.deviceId}</TableCell>
                          <TableCell>{item.actionType}</TableCell>
                          <TableCell><Badge variant="outline">{item.status}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.resultRefType ?? "—"} {item.resultRefId ?? ""}</TableCell>
                          <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">{item.summaryJson ? JSON.stringify(item.summaryJson) : "—"}</TableCell>
                          <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">{item.errorMessage ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md border bg-muted/30 p-2 text-muted-foreground">{icon}</div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm">{value}</div>
    </div>
  );
}

function ScheduleForm({
  form,
  setForm,
  onSubmit,
  pending,
}: {
  form: JobFormState;
  setForm: React.Dispatch<React.SetStateAction<JobFormState>>;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name">
          <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
        </Field>
        <Field label="Description">
          <Input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
        </Field>
        <Field label="Job Type">
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={form.jobType}
            onChange={(event) => setForm((current) => ({ ...current, jobType: event.target.value as JobFormState["jobType"], contextsJson: event.target.value === "health_check" ? JSON.stringify(["health"], null, 2) : event.target.value === "compliance" ? JSON.stringify(["compliance"], null, 2) : DEFAULT_CONTEXTS }))}
          >
            <option value="discovery">discovery</option>
            <option value="compliance">compliance</option>
            <option value="health_check">health_check</option>
          </select>
        </Field>
        <Field label="Target Type">
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={form.targetType}
            onChange={(event) => setForm((current) => ({ ...current, targetType: event.target.value as JobFormState["targetType"] }))}
          >
            <option value="device">device</option>
            <option value="device_group">device_group</option>
            <option value="all_devices">all_devices</option>
          </select>
        </Field>
        <Field label="Target ID">
          <Input value={form.targetId} onChange={(event) => setForm((current) => ({ ...current, targetId: event.target.value }))} placeholder="1" disabled={form.targetType === "all_devices"} />
        </Field>
        <Field label="Interval Minutes">
          <Input type="number" min={1} value={form.intervalMinutes} onChange={(event) => setForm((current) => ({ ...current, intervalMinutes: event.target.value }))} />
        </Field>
        <Field label="Max Runtime Seconds">
          <Input type="number" min={60} value={form.maxRuntimeSeconds} onChange={(event) => setForm((current) => ({ ...current, maxRuntimeSeconds: event.target.value }))} />
        </Field>
        <Field label="Cron Expression">
          <Input value={form.cronExpression} onChange={(event) => setForm((current) => ({ ...current, cronExpression: event.target.value }))} placeholder="*/15 * * * *" />
        </Field>
      </div>
      <Field label="Contexts JSON">
        <Textarea rows={8} value={form.contextsJson} onChange={(event) => setForm((current) => ({ ...current, contextsJson: event.target.value }))} />
      </Field>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />
          Enabled
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.runOnStartup} onChange={(event) => setForm((current) => ({ ...current, runOnStartup: event.target.checked }))} />
          Run on startup
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onSubmit} disabled={pending}>Save</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

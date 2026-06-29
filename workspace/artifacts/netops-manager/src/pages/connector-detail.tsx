import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ShieldOff, Terminal, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";
import { useTranslation } from "@/i18n";
import {
  createDiagnosticJob,
  deleteConnector,
  getConnector,
  getConnectorJob,
  getWireGuardConfig,
  listConnectorJobs,
  listConnectorAlertsForConnector,
  acknowledgeConnectorAlert,
  resolveConnectorAlert,
  getConnectorHealth,
  revokeConnector,
  type ConnectorAlert,
} from "@/features/connectors/connectors-api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ConnectorDetailPage() {
  const [, params] = useRoute("/infrastructure/connectors/:id");
  const [path, navigate] = useLocation();
  const id = Number(params?.id);
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canWrite = user?.role === "admin" || user?.role === "operator";
  const isAdmin = user?.role === "admin";

  const [pingTarget, setPingTarget] = useState("");
  const [sshTarget, setSshTarget] = useState("");
  const [sshCommand, setSshCommand] = useState("display version");
  const [wgConfig, setWgConfig] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Record<string, unknown> | null>(null);
  const [activeTab, setActiveTab] = useState("summary");

  useEffect(() => {
    const q = path.includes("?") ? path.slice(path.indexOf("?")) : "";
    const tab = new URLSearchParams(q).get("tab");
    if (tab) setActiveTab(tab);
  }, [path]);

  const connectorQuery = useQuery({
    queryKey: ["connector", id],
    queryFn: () => getConnector(id),
    enabled: Number.isInteger(id) && id > 0,
  });

  const jobsQuery = useQuery({
    queryKey: ["connector-jobs", id],
    queryFn: () => listConnectorJobs(id),
    enabled: Number.isInteger(id) && id > 0,
    refetchInterval: 10_000,
  });

  const alertsQuery = useQuery({
    queryKey: ["connector-alerts", id],
    queryFn: () => listConnectorAlertsForConnector(id),
    enabled: Number.isInteger(id) && id > 0,
    refetchInterval: 30_000,
  });

  const alertActionMutation = useMutation({
    mutationFn: (input: { alertId: number; action: "ack" | "resolve" }) =>
      input.action === "ack"
        ? acknowledgeConnectorAlert(input.alertId)
        : resolveConnectorAlert(input.alertId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connector-alerts", id] });
      void queryClient.invalidateQueries({ queryKey: ["connector-health-summary"] });
      toast({ title: t("connectorDetail.toastAlertUpdated") });
    },
    onError: (e: Error) => toast({ title: t("connectorDetail.error"), description: e.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeConnector(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connector", id] });
      void queryClient.invalidateQueries({ queryKey: ["connector-jobs", id] });
      toast({
        title: t("connectorDetail.toastRevoked"),
        description: t("connectorDetail.toastRevokedDesc"),
      });
    },
    onError: (e: Error) => toast({ title: t("connectorDetail.error"), description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteConnector(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
      toast({
        title: t("connectorDetail.toastRemoved"),
        description: t("connectorDetail.toastRemovedDesc"),
      });
      navigate("/infrastructure/connectors");
    },
    onError: (e: Error) => toast({ title: t("connectorDetail.error"), description: e.message, variant: "destructive" }),
  });

  const diagMutation = useMutation({
    mutationFn: (input: { kind: "ping" | "ssh-command"; body: Record<string, unknown> }) =>
      createDiagnosticJob(id, input.kind, input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connector-jobs", id] });
      toast({ title: t("connectorDetail.toastJobQueued"), description: t("connectorDetail.toastJobQueuedDesc") });
    },
    onError: (e: Error) => toast({ title: t("connectorDetail.error"), description: e.message, variant: "destructive" }),
  });

  const c = connectorQuery.data;
  if (connectorQuery.isLoading) {
    return <div className="p-0">{t("connectorDetail.loading")}</div>;
  }
  if (!c) {
    return <div className="p-0">{t("connectorDetail.notFound")}</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/infrastructure/connectors">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t("connectorDetail.back")}
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">{c.name}</h1>
          <p className="text-sm text-muted-foreground">
            {c.tenant_name} · <Badge>{c.status}</Badge>
          </p>
        </div>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">{t("connectorDetail.tabs.summary")}</TabsTrigger>
          <TabsTrigger value="wireguard">{t("connectorDetail.tabs.wireguard")}</TabsTrigger>
          <TabsTrigger value="jobs">{t("connectorDetail.tabs.jobs")}</TabsTrigger>
          <TabsTrigger value="diagnostics">{t("connectorDetail.tabs.diagnostics")}</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-6 grid gap-2 text-sm md:grid-cols-2">
              <p>
                <span className="text-muted-foreground">{t("connectorDetail.wgIp")}</span> {c.wireguard_ip ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">{t("connectorDetail.lastHeartbeat")}</span>{" "}
                {c.last_heartbeat ? new Date(c.last_heartbeat).toLocaleString() : t("connectorDetail.never")}
              </p>
              <p>
                <span className="text-muted-foreground">{t("connectorDetail.versionLabel")}</span> {c.version ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">{t("connectorDetail.devices")}</span> {c.device_count}
              </p>
              <p>
                <span className="text-muted-foreground">{t("connectorDetail.pendingJobs")}</span> {c.pending_jobs}
              </p>
            </CardContent>
          </Card>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              {c.status !== "REVOKED" && (
                <Button variant="destructive" onClick={() => revokeMutation.mutate()} disabled={revokeMutation.isPending}>
                  <ShieldOff className="h-4 w-4 mr-2" />
                  {t("connectorDetail.revokeConnector")}
                </Button>
              )}
              <Button
                variant="outline"
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t("connectorDetail.removeConnector")}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("connectorDetail.severity")}</TableHead>
                    <TableHead>{t("connectorDetail.type")}</TableHead>
                    <TableHead>{t("connectorDetail.status")}</TableHead>
                    <TableHead>{t("connectorDetail.alertTitle")}</TableHead>
                    <TableHead>{t("connectorDetail.message")}</TableHead>
                    <TableHead>{t("connectorDetail.firstOccurrence")}</TableHead>
                    <TableHead>{t("connectorDetail.lastOccurrence")}</TableHead>
                    <TableHead>{t("connectorDetail.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(alertsQuery.data ?? []).map((alert: ConnectorAlert) => (
                    <TableRow key={alert.id}>
                      <TableCell>
                        <Badge variant={alert.severity === "CRITICAL" ? "destructive" : "secondary"}>
                          {alert.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{alert.alert_type}</TableCell>
                      <TableCell>{alert.status}</TableCell>
                      <TableCell>{alert.title}</TableCell>
                      <TableCell className="max-w-xs truncate">{alert.message}</TableCell>
                      <TableCell className="text-xs">{new Date(alert.first_seen_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{new Date(alert.last_seen_at).toLocaleString()}</TableCell>
                      <TableCell className="space-x-1">
                        {canWrite && alert.status === "OPEN" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={alertActionMutation.isPending}
                            onClick={() => alertActionMutation.mutate({ alertId: alert.id, action: "ack" })}
                          >
                            {t("connectorDetail.ack")}
                          </Button>
                        )}
                        {canWrite && (alert.status === "OPEN" || alert.status === "ACKNOWLEDGED") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={alertActionMutation.isPending}
                            onClick={() => alertActionMutation.mutate({ alertId: alert.id, action: "resolve" })}
                          >
                            {t("connectorDetail.resolve")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(alertsQuery.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                        {t("connectorDetail.noAlerts")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wireguard" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("connectorDetail.wgConfigTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const data = await getWireGuardConfig(id);
                  setWgConfig(data.config);
                }}
              >
                {t("connectorDetail.loadPreview")}
              </Button>
              {wgConfig && (
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-80">{wgConfig}</pre>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("connectorDetail.date")}</TableHead>
                    <TableHead>{t("connectorDetail.device")}</TableHead>
                    <TableHead>{t("connectorDetail.type")}</TableHead>
                    <TableHead>{t("connectorDetail.target")}</TableHead>
                    <TableHead>{t("connectorDetail.status")}</TableHead>
                    <TableHead>{t("connectorDetail.duration")}</TableHead>
                    <TableHead>{t("connectorDetail.createdBy")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(jobsQuery.data ?? []).map((job) => (
                    <TableRow key={String(job.id)}>
                      <TableCell className="text-xs">{job.created_at ? new Date(String(job.created_at)).toLocaleString() : "—"}</TableCell>
                      <TableCell>{String(job.device_hostname ?? job.device_id ?? "—")}</TableCell>
                      <TableCell className="font-mono text-xs">{String(job.job_type)}</TableCell>
                      <TableCell className="font-mono text-xs">{String(job.target_ip ?? "—")}</TableCell>
                      <TableCell>{String(job.status)}</TableCell>
                      <TableCell>{job.duration_ms != null ? `${job.duration_ms}ms` : "—"}</TableCell>
                      <TableCell>{String(job.created_by_name ?? "—")}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const detail = await getConnectorJob(id, Number(job.id));
                            setSelectedJob(detail);
                          }}
                        >
                          {t("connectorDetail.viewResult")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(jobsQuery.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                        {t("connectorDetail.noJobsYet")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnostics" className="mt-4 space-y-4">
          {canWrite && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("connectorDetail.pingReadOnly")}</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Input placeholder="10.10.10.1" value={pingTarget} onChange={(e) => setPingTarget(e.target.value)} />
                  <Button
                    disabled={!pingTarget || diagMutation.isPending}
                    onClick={() => diagMutation.mutate({ kind: "ping", body: { target_ip: pingTarget } })}
                  >
                    {t("connectorDetail.enqueue")}
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    {t("connectorDetail.sshReadOnly")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Input placeholder={t("connectorDetail.deviceIpPlaceholder")} value={sshTarget} onChange={(e) => setSshTarget(e.target.value)} />
                  <Input placeholder="display version" value={sshCommand} onChange={(e) => setSshCommand(e.target.value)} />
                  <Button
                    disabled={!sshTarget || !sshCommand || diagMutation.isPending}
                    onClick={() =>
                      diagMutation.mutate({
                        kind: "ssh-command",
                        body: { target_ip: sshTarget, command: sshCommand },
                      })
                    }
                  >
                    {t("connectorDetail.enqueueSsh")}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("connectorDetail.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("connectorDetail.deleteDesc", { name: c.name, tenant: c.tenant_name, count: String(c.device_count) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("connectorDetail.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {t("connectorDetail.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(selectedJob)} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("connectorDetail.jobTitle", { id: String(selectedJob?.id ?? "") })}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm">
                <p>
                  {t("connectorDetail.statusDuration", {
                    status: String(selectedJob?.status),
                    duration: String(selectedJob?.duration_ms ?? "—"),
                  })}
                </p>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-40">
                  {JSON.stringify(selectedJob?.payload_json ?? {}, null, 2)}
                </pre>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-48 whitespace-pre-wrap">
                  {String((selectedJob?.result as { stdout?: string } | undefined)?.stdout ?? "—")}
                </pre>
                {(selectedJob?.result as { stderr?: string } | undefined)?.stderr ? (
                  <pre className="text-xs bg-destructive/10 p-3 rounded-md overflow-auto max-h-32 whitespace-pre-wrap">
                    {String((selectedJob?.result as { stderr?: string }).stderr)}
                  </pre>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("connectorDetail.close")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

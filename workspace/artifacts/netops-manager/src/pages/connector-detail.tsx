import { useState } from "react";
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
import {
  createDiagnosticJob,
  deleteConnector,
  getConnector,
  getConnectorJob,
  getWireGuardConfig,
  listConnectorJobs,
  revokeConnector,
} from "@/features/connectors/connectors-api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ConnectorDetailPage() {
  const [, params] = useRoute("/infrastructure/connectors/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canWrite = user?.role === "admin" || user?.role === "operator";
  const isAdmin = user?.role === "admin";

  const [pingTarget, setPingTarget] = useState("");
  const [sshTarget, setSshTarget] = useState("");
  const [sshCommand, setSshCommand] = useState("display version");
  const [wgConfig, setWgConfig] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Record<string, unknown> | null>(null);

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

  const revokeMutation = useMutation({
    mutationFn: () => revokeConnector(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connector", id] });
      void queryClient.invalidateQueries({ queryKey: ["connector-jobs", id] });
      toast({
        title: "Connector revogado",
        description: "Jobs pendentes cancelados. Crie novamente com o mesmo nome para emitir um novo token.",
      });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteConnector(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
      toast({
        title: "Connector removido",
        description: "O registro foi excluído. Dispositivos vinculados ficaram sem connector atribuído.",
      });
      navigate("/infrastructure/connectors");
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const diagMutation = useMutation({
    mutationFn: (input: { kind: "ping" | "ssh-command"; body: Record<string, unknown> }) =>
      createDiagnosticJob(id, input.kind, input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connector-jobs", id] });
      toast({ title: "Job enfileirado", description: "O connector agent executará localmente." });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const c = connectorQuery.data;
  if (connectorQuery.isLoading) {
    return <div className="p-6">Carregando…</div>;
  }
  if (!c) {
    return <div className="p-6">Connector não encontrado.</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/infrastructure/connectors">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
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
          <TabsTrigger value="summary">Resumo</TabsTrigger>
          <TabsTrigger value="wireguard">WireGuard</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnóstico</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-6 grid gap-2 text-sm md:grid-cols-2">
              <p>
                <span className="text-muted-foreground">IP WireGuard:</span> {c.wireguard_ip ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Último heartbeat:</span>{" "}
                {c.last_heartbeat ? new Date(c.last_heartbeat).toLocaleString() : "nunca"}
              </p>
              <p>
                <span className="text-muted-foreground">Versão:</span> {c.version ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Dispositivos:</span> {c.device_count}
              </p>
              <p>
                <span className="text-muted-foreground">Jobs pendentes:</span> {c.pending_jobs}
              </p>
            </CardContent>
          </Card>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              {c.status !== "REVOKED" && (
                <Button variant="destructive" onClick={() => revokeMutation.mutate()} disabled={revokeMutation.isPending}>
                  <ShieldOff className="h-4 w-4 mr-2" />
                  Revogar connector
                </Button>
              )}
              <Button
                variant="outline"
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remover connector
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="wireguard" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuração (sem chave privada)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const data = await getWireGuardConfig(id);
                  setWgConfig(data.config);
                }}
              >
                Carregar preview
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
                    <TableHead>Data</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Criado por</TableHead>
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
                          Ver resultado
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(jobsQuery.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                        Nenhum job ainda.
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
                  <CardTitle className="text-base">Ping (read-only)</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Input placeholder="10.10.10.1" value={pingTarget} onChange={(e) => setPingTarget(e.target.value)} />
                  <Button
                    disabled={!pingTarget || diagMutation.isPending}
                    onClick={() => diagMutation.mutate({ kind: "ping", body: { target_ip: pingTarget } })}
                  >
                    Enfileirar
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    SSH read-only
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Input placeholder="IP do equipamento" value={sshTarget} onChange={(e) => setSshTarget(e.target.value)} />
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
                    Enfileirar SSH
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
            <AlertDialogTitle>Remover connector?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso excluirá permanentemente <strong>{c.name}</strong> ({c.tenant_name}), incluindo jobs e histórico de
              heartbeat. Dispositivos vinculados ({c.device_count}) ficarão sem connector. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(selectedJob)} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Job #{String(selectedJob?.id ?? "")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm">
                <p>Status: {String(selectedJob?.status)} · Duração: {String(selectedJob?.duration_ms ?? "—")}ms</p>
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
            <AlertDialogCancel>Fechar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ShieldOff, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";
import {
  createDiagnosticJob,
  getConnector,
  getWireGuardConfig,
  listConnectorJobs,
  revokeConnector,
} from "@/features/connectors/connectors-api";

export default function ConnectorDetailPage() {
  const [, params] = useRoute("/infrastructure/connectors/:id");
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
      toast({ title: "Connector revogado" });
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
          {isAdmin && c.status !== "REVOKED" && (
            <Button variant="destructive" onClick={() => revokeMutation.mutate()} disabled={revokeMutation.isPending}>
              <ShieldOff className="h-4 w-4 mr-2" />
              Revogar connector
            </Button>
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
              <ul className="space-y-2 text-sm">
                {(jobsQuery.data ?? []).map((job) => (
                  <li key={String(job.id)} className="border-b border-border pb-2 font-mono text-xs">
                    #{String(job.id)} {String(job.job_type)} → {String(job.status)} {String(job.target_ip ?? "")}
                  </li>
                ))}
                {(jobsQuery.data ?? []).length === 0 && (
                  <li className="text-muted-foreground">Nenhum job ainda.</li>
                )}
              </ul>
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
    </div>
  );
}

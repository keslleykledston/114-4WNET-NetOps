import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Waypoints, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";
import {
  createConnector,
  createTenant,
  listConnectors,
  listTenants,
  type ConnectorCreateResult,
} from "@/features/connectors/connectors-api";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ONLINE") return "default";
  if (status === "PENDING") return "secondary";
  if (status === "OFFLINE" || status === "REVOKED") return "destructive";
  return "outline";
}

export default function ConnectorsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canWrite = user?.role === "admin" || user?.role === "operator";

  const [tenantName, setTenantName] = useState("");
  const [connectorName, setConnectorName] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [createdToken, setCreatedToken] = useState<ConnectorCreateResult | null>(null);

  const connectorsQuery = useQuery({
    queryKey: ["connectors"],
    queryFn: listConnectors,
    refetchInterval: 30_000,
  });

  const tenantsQuery = useQuery({
    queryKey: ["connectors-tenants"],
    queryFn: listTenants,
  });

  const createTenantMutation = useMutation({
    mutationFn: () => createTenant({ name: tenantName }),
    onSuccess: () => {
      setTenantName("");
      void queryClient.invalidateQueries({ queryKey: ["connectors-tenants"] });
      toast({ title: "Tenant criado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const createConnectorMutation = useMutation({
    mutationFn: () =>
      createConnector({
        tenant_id: Number(selectedTenantId),
        name: connectorName.trim(),
      }),
    onSuccess: (data) => {
      setCreatedToken(data);
      setConnectorName("");
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
      toast({
        title: data.reprovisioned ? "Connector reemitido" : "Connector criado",
        description: data.reprovisioned
          ? "Connector revogado reativado com novo token. Copie o token agora — não será exibido novamente."
          : "Copie o token agora — não será exibido novamente.",
      });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Waypoints className="h-6 w-6 text-primary" />
            Conectores / Bastião
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            WireGuard transporta; o Connector Agent executa SSH/SNMP no ambiente do cliente.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void connectorsQuery.refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {canWrite && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Novo tenant</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Input placeholder="Cliente A" value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
                <Button disabled={!tenantName.trim() || createTenantMutation.isPending} onClick={() => createTenantMutation.mutate()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {(tenantsQuery.data ?? []).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Tenants existentes: {(tenantsQuery.data ?? []).map((t) => t.name).join(", ")}.
                  Após revogar um connector, reutilize o tenant e o mesmo nome — um novo token será emitido automaticamente.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Novo connector</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
              >
                <option value="">Tenant…</option>
                {(tenantsQuery.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Input
                  placeholder="cliente-a-connector-01"
                  value={connectorName}
                  onChange={(e) => setConnectorName(e.target.value)}
                />
                <Button
                  disabled={!connectorName.trim() || !selectedTenantId || createConnectorMutation.isPending}
                  onClick={() => createConnectorMutation.mutate()}
                >
                  Criar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Se o connector com esse nome estiver revogado, ele será reemitido (mesmo ID, novo token e chaves WireGuard).
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {createdToken && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base text-amber-600 dark:text-amber-400">Token gerado (copie agora)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm font-mono break-all">
            <p>{createdToken.connector_token}</p>
            <Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(createdToken.connector_token)}>
              Copiar token
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conectores</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>IP WG</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Versão</TableHead>
                <TableHead>Último heartbeat</TableHead>
                <TableHead>Jobs</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(connectorsQuery.data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.tenant_name}</TableCell>
                  <TableCell className="font-mono text-xs">{c.wireguard_ip ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                  </TableCell>
                  <TableCell>{c.version ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.last_heartbeat ? new Date(c.last_heartbeat).toLocaleString() : "nunca"}
                  </TableCell>
                  <TableCell>{c.pending_jobs}</TableCell>
                  <TableCell>
                    <Link href={`/infrastructure/connectors/${c.id}`}>
                      <Button variant="ghost" size="sm">
                        Detalhes
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {!connectorsQuery.isLoading && (connectorsQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhum connector cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

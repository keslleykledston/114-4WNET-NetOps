import type { Device } from "@workspace/api-client-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Radar, RefreshCw, ShieldAlert } from "lucide-react";
import { useDiscoverySnapshot, useRunDiscovery } from "./discovery-api";

export function DiscoveryPanel({ device }: { device: Device }) {
  const { toast } = useToast();
  const { data: snapshot, isLoading, isError } = useDiscoverySnapshot(device.id);
  const runDiscovery = useRunDiscovery(device.id);

  function execute() {
    runDiscovery.mutate(undefined, {
      onSuccess: (result) => toast({ title: "Discovery concluido", description: `Status: ${result.status}` }),
      onError: (error) => toast({ title: "Falha no discovery", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" }),
    });
  }

  const needsWarning = snapshot?.status === "failed" || snapshot?.sourceStatus.ssh === "failed" || snapshot?.sourceStatus.cachedConfig === "missing";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Radar className="h-5 w-5" />
          Discovery
        </CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={execute} disabled={runDiscovery.isPending}>
          <RefreshCw className={`mr-2 h-4 w-4 ${runDiscovery.isPending ? "animate-spin" : ""}`} />
          {runDiscovery.isPending ? "Executando via connector..." : "Executar discovery"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : snapshot ? (
          <>
            <div className="grid gap-3 text-sm md:grid-cols-4">
              <StatusItem label="Status" value={snapshot.status} />
              <StatusItem label="SSH" value={snapshot.sourceStatus.ssh} />
              <StatusItem label="SNMP" value={snapshot.sourceStatus.snmp} />
              <StatusItem label="Cache" value={snapshot.sourceStatus.cachedConfig} />
            </div>
            <div className="flex flex-wrap gap-2">
              {snapshot.contexts.map((context) => <Badge key={context} variant="outline">{context}</Badge>)}
            </div>
            <div className="text-xs text-muted-foreground">
              Ultimo discovery: {new Date(snapshot.finishedAt).toLocaleString()} · {snapshot.interfaces.length} interfaces · {snapshot.bgpPeers.length} peers · {snapshot.vrfs.length} VRFs · {snapshot.l2vpn.l2vcs.length + snapshot.l2vpn.vsis.length} L2VPN · {snapshot.policies.length} policies
            </div>
            {snapshot.cachedFromPersistedSnapshot && (
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Snapshot recuperado do banco local</AlertTitle>
                <AlertDescription>
                  A ultima coleta viva nao foi a fonte principal desta visualizacao; os dados persistidos mantiveram o sistema integro.
                </AlertDescription>
              </Alert>
            )}
            {needsWarning && (
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Dados com restricao de confianca</AlertTitle>
                <AlertDescription>
                  Verifique SSH, cache de configuracao e fallback SNMP antes de usar estes dados em compliance critico.
                </AlertDescription>
              </Alert>
            )}
          </>
        ) : isError ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhum discovery snapshot encontrado. Execute discovery primeiro para {device.hostname}.
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhum discovery executado para {device.hostname}.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}

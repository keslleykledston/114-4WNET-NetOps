import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useListDevices } from "@workspace/api-client-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ArrowLeft, Shield, Terminal } from "lucide-react";
import {
  BgpPeerDrilldownView,
  BgpPeerSshDetailError,
  useBgpPeerDrilldown,
  useBgpPeerDrilldownHistory,
  useBgpPeerSshDetail,
} from "@/features/bgp-drilldown";
import type { BgpPeerSshDetailStatus } from "@/features/bgp-drilldown/types";

function readInitialQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    deviceId: params.get("deviceId") ?? params.get("device_id") ?? "",
    peer: params.get("peer") ?? params.get("peerIp") ?? "172.28.1.138",
    auto: params.get("auto") === "1" || params.has("deviceId"),
  };
}

export default function BgpPeerDrilldownPage() {
  const initial = useMemo(() => readInitialQuery(), []);
  const [deviceId, setDeviceId] = useState(initial.deviceId);
  const [peer, setPeer] = useState(initial.peer);
  const [submitted, setSubmitted] = useState<{ deviceId: number; peer: string } | null>(null);
  const [detailStatus, setDetailStatus] = useState<BgpPeerSshDetailStatus>("idle");
  const [detailDisabled, setDetailDisabled] = useState(false);

  const { data: devices = [] } = useListDevices();
  const detailMutation = useBgpPeerSshDetail();

  useEffect(() => {
    if (initial.auto && initial.deviceId && initial.peer) {
      const id = Number(initial.deviceId);
      if (id > 0) {
        setSubmitted({ deviceId: id, peer: initial.peer });
      }
    }
  }, [initial.auto, initial.deviceId, initial.peer]);

  const query = useBgpPeerDrilldown({
    deviceId: submitted?.deviceId ?? 0,
    peer: submitted?.peer ?? "",
    source: "snapshot",
    includePolicies: true,
    includePolicyObjects: true,
    enabled: Boolean(submitted),
  });
  const historyQuery = useBgpPeerDrilldownHistory({
    deviceId: submitted?.deviceId ?? 0,
    peer: submitted?.peer ?? "",
    enabled: Boolean(submitted),
    limit: 20,
  });
  const refetchHistory = historyQuery.refetch;

  useEffect(() => {
    if (query.data) {
      void refetchHistory();
    }
  }, [query.data?.collectedAt, refetchHistory]);

  function handleConsultar() {
    const id = Number(deviceId);
    const peerVal = peer.trim();
    if (!id || !peerVal) return;
    setSubmitted({ deviceId: id, peer: peerVal });
    setDetailStatus("idle");
    setDetailDisabled(false);
    detailMutation.reset();
    const url = new URL(window.location.href);
    url.searchParams.set("deviceId", String(id));
    url.searchParams.set("peer", peerVal);
    window.history.replaceState({}, "", url.pathname + url.search);
  }

  function handleSshDetail() {
    if (!submitted || detailDisabled) return;
    setDetailStatus("running");
    detailMutation.mutate(submitted, {
      onSuccess: () => setDetailStatus("completed"),
      onError: (error) => {
        if (error instanceof BgpPeerSshDetailError && error.code === "BGP_DRILLDOWN_SSH_DETAIL_DISABLED") {
          setDetailDisabled(true);
          setDetailStatus("disabled");
          return;
        }
        setDetailStatus("failed");
      },
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/netops-operations">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            NetOps
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">BGP Peer Drilldown</h1>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="outline">Source: snapshot</Badge>
            <Badge variant="outline">Read-only</Badge>
            <Badge variant="outline">Sem comandos no equipamento</Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consulta</CardTitle>
          <CardDescription>GET /api/bgp/peers/:deviceId/:peer/drilldown?source=snapshot</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-4 md:items-end">
          <div className="flex-1 space-y-2">
            <Label>Device</Label>
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o device" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.hostname} (#{d.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-2">
            <Label>Peer (IP ou nome)</Label>
            <Input
              value={peer}
              onChange={(e) => setPeer(e.target.value)}
              placeholder="172.28.1.138"
              className="font-mono"
            />
          </div>
          <Button type="button" onClick={handleConsultar} disabled={!deviceId || !peer.trim()}>
            <Search className="h-4 w-4 mr-2" />
            Consultar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            SSH detail leve
          </CardTitle>
          <CardDescription>
            Executa comandos read-only leves no equipamento. Não coleta rotas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-amber-500/30 bg-amber-500/5">
            <Shield className="h-4 w-4 text-amber-400" />
            <AlertTitle>Protegido por feature gate</AlertTitle>
            <AlertDescription>
              BGP_DRILLDOWN_SSH_DETAIL_ENABLED fica false por padrão. Com flag desativada, o backend retorna 503 antes de abrir SSH.
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleSshDetail}
              disabled={!submitted || detailStatus === "running" || detailDisabled}
            >
              <Terminal className="h-4 w-4 mr-2" />
              {detailStatus === "running" ? "Atualizando..." : "Atualizar detalhe via SSH"}
            </Button>
            <Badge variant="outline" className="font-mono">
              detail={detailStatus}
            </Badge>
          </div>
          {detailMutation.error ? (
            <p className="text-sm text-muted-foreground">
              {detailMutation.error instanceof Error ? detailMutation.error.message : "Falha ao consultar SSH detail."}
            </p>
          ) : null}
          {detailMutation.data ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">ssh_detail</Badge>
                <Badge variant="outline">{new Date(detailMutation.data.collectedAt).toLocaleString()}</Badge>
                <Badge variant="outline">{detailMutation.data.commands.length} comandos</Badge>
              </div>
              <div className="max-h-96 overflow-auto rounded-md border border-border bg-muted/20 p-3">
                {detailMutation.data.evidence.map((item) => (
                  <div key={item.command} className="mb-4">
                    <div className="font-mono text-xs text-muted-foreground">{item.command}</div>
                    <pre className="mt-1 whitespace-pre-wrap text-xs">{item.error ?? (item.output || "sem saída")}</pre>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="drilldown" className="w-full">
        <TabsList>
          <TabsTrigger value="drilldown">Drilldown</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="drilldown" className="mt-4">
          <BgpPeerDrilldownView
            data={query.data}
            loading={query.isFetching && Boolean(submitted)}
            error={query.error}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico</CardTitle>
              <CardDescription>Resultados persistidos do drilldown. Cache read-only; não substitui snapshot original.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!submitted ? (
                <p className="text-sm text-muted-foreground">Consulte um peer para carregar histórico.</p>
              ) : historyQuery.isFetching ? (
                <p className="text-sm text-muted-foreground">Carregando histórico...</p>
              ) : historyQuery.error ? (
                <Alert variant="destructive">
                  <AlertTitle>Erro ao carregar histórico</AlertTitle>
                  <AlertDescription>{historyQuery.error.message}</AlertDescription>
                </Alert>
              ) : historyQuery.data?.items.length ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Collected</th>
                        <th className="px-3 py-2 text-left font-medium">Source</th>
                        <th className="px-3 py-2 text-left font-medium">Config source</th>
                        <th className="px-3 py-2 text-left font-medium">Warnings</th>
                        <th className="px-3 py-2 text-left font-medium">Expires</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyQuery.data.items.map((item) => (
                        <tr key={item.id} className="border-t border-border">
                          <td className="px-3 py-2 font-mono text-xs">{new Date(item.collectedAt).toLocaleString()}</td>
                          <td className="px-3 py-2"><Badge variant="outline">{item.source}</Badge></td>
                          <td className="px-3 py-2"><Badge variant="outline">{item.configBuildSource}</Badge></td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {item.warnings.length ? item.warnings.join("; ") : "sem warnings"}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{new Date(item.expiresAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sem histórico persistido para este peer.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

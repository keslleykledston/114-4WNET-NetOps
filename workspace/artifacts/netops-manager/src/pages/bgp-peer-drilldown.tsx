import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  getListNetopsDeviceBgpPeersQueryKey,
  useListDevices,
  useListNetopsDeviceBgpPeers,
} from "@workspace/api-client-react";
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
import { Search, ArrowLeft, Shield, Terminal, RefreshCw } from "lucide-react";
import {
  BgpDrilldownHistoryPanel,
  BgpDrilldownRecomputeNotice,
  BgpPeerDrilldownView,
  BgpPeerSshDetailError,
  useBgpPeerDrilldown,
  useBgpPeerDrilldownHistory,
  useBgpPeerSshDetail,
} from "@/features/bgp-drilldown";
import type { BgpPeerSshDetailStatus } from "@/features/bgp-drilldown/types";
import { BgpPeerContextCard } from "@/features/bgp/bgp-peer-context-card";
import { BGP_POLICY_EDITOR_ENABLED } from "@/features/bgp-policy-editor/bgp-policy-editor.utils";
import { BgpPolicyEditorModal } from "@/features/bgp-policy-editor/bgp-policy-editor-modal";
import { useCommunityLibraryItems, useCommunitySets } from "@/features/device-discovery/community-api";
import { useTranslation } from "@/i18n";

function readInitialQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    deviceId: params.get("deviceId") ?? params.get("device_id") ?? "",
    peer: params.get("peer") ?? params.get("peerIp") ?? "172.28.1.138",
    auto: params.get("auto") === "1" || params.has("deviceId"),
  };
}

export default function BgpPeerDrilldownPage() {
  const { t } = useTranslation();
  const initial = useMemo(() => readInitialQuery(), []);
  const [deviceId, setDeviceId] = useState(initial.deviceId);
  const [peer, setPeer] = useState(initial.peer);
  const [submitted, setSubmitted] = useState<{ deviceId: number; peer: string } | null>(null);
  const [forceRecompute, setForceRecompute] = useState(false);
  const [detailStatus, setDetailStatus] = useState<BgpPeerSshDetailStatus>("idle");
  const [detailDisabled, setDetailDisabled] = useState(false);
  const [policyEditorOpen, setPolicyEditorOpen] = useState(false);

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
    forceRecompute,
    enabled: Boolean(submitted),
  });
  const historyQuery = useBgpPeerDrilldownHistory({
    deviceId: submitted?.deviceId ?? 0,
    peer: submitted?.peer ?? "",
    enabled: Boolean(submitted),
    limit: 20,
  });
  const netopsPeersQuery = useListNetopsDeviceBgpPeers(submitted?.deviceId ?? 0, undefined, {
    query: {
      enabled: Boolean(submitted?.deviceId),
      staleTime: 60_000,
      queryKey: getListNetopsDeviceBgpPeersQueryKey(submitted?.deviceId ?? 0),
    },
  });
  const communityLibraryQuery = useCommunityLibraryItems(submitted?.deviceId ?? 0);
  const communitySetsQuery = useCommunitySets(submitted?.deviceId ?? 0);
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
    setForceRecompute(false);
    setSubmitted({ deviceId: id, peer: peerVal });
    setDetailStatus("idle");
    setDetailDisabled(false);
    detailMutation.reset();
    const url = new URL(window.location.href);
    url.searchParams.set("deviceId", String(id));
    url.searchParams.set("peer", peerVal);
    window.history.replaceState({}, "", url.pathname + url.search);
  }

  function handleRecomputeSnapshot() {
    if (!submitted) return;
    setForceRecompute(true);
  }

  useEffect(() => {
    if (forceRecompute && !query.isFetching && query.data?.cache?.status === "recomputed") {
      setForceRecompute(false);
    }
  }, [forceRecompute, query.isFetching, query.data?.cache?.status]);

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

  const device = submitted ? devices.find((item) => item.id === submitted.deviceId) ?? null : null;
  const peerSummary = netopsPeersQuery.data?.find((item) => item.peerIp === (submitted?.peer ?? ""));
  const netopsHref = submitted?.deviceId ? `/netops-operations?deviceId=${submitted.deviceId}` : "/netops-operations";
  const operationalHref = submitted?.deviceId ? `/operational/bgp?deviceId=${submitted.deviceId}` : "/operational/bgp";
  const drilldownHref = submitted ? `/bgp/peer-drilldown?deviceId=${submitted.deviceId}&peer=${encodeURIComponent(submitted.peer)}&auto=1` : "/bgp/peer-drilldown";

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href={netopsHref}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t("bgpPeerDrilldown.backToCockpit")}
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("bgpPeerDrilldown.title")}</h1>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="outline">{t("bgpPeerDrilldown.badgeSourceSnapshot")}</Badge>
            <Badge variant="outline">{t("bgpPeerDrilldown.badgeReadOnly")}</Badge>
            <Badge variant="outline">{t("bgpPeerDrilldown.badgeNoCommands")}</Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("bgpPeerDrilldown.queryTitle")}</CardTitle>
          <CardDescription>{t("bgpPeerDrilldown.queryDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-4 md:items-end">
          <div className="flex-1 space-y-2">
            <Label>{t("bgpPeerDrilldown.device")}</Label>
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger>
                <SelectValue placeholder={t("bgpPeerDrilldown.selectDevice")} />
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
            <Label>{t("bgpPeerDrilldown.peerLabel")}</Label>
            <Input
              value={peer}
              onChange={(e) => setPeer(e.target.value)}
              placeholder="172.28.1.138"
              className="font-mono"
            />
          </div>
          <Button type="button" onClick={handleConsultar} disabled={!deviceId || !peer.trim()}>
            <Search className="h-4 w-4 mr-2" />
            {t("bgpPeerDrilldown.consult")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleRecomputeSnapshot}
            disabled={!submitted || query.isFetching}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("bgpPeerDrilldown.recomputeSnapshot")}
          </Button>
        </CardContent>
      </Card>

      {submitted ? <BgpDrilldownRecomputeNotice /> : null}

      {submitted ? (
        <BgpPeerContextCard
          device={device}
          peer={peerSummary ?? null}
          drilldownHref={drilldownHref}
          netopsHref={netopsHref}
          operationalHref={operationalHref}
          onEditPolicy={BGP_POLICY_EDITOR_ENABLED ? () => setPolicyEditorOpen(true) : undefined}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            {t("bgpPeerDrilldown.sshDetailTitle")}
          </CardTitle>
          <CardDescription>
            {t("bgpPeerDrilldown.sshDetailDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-amber-500/30 bg-amber-500/5">
            <Shield className="h-4 w-4 text-amber-400" />
            <AlertTitle>{t("bgpPeerDrilldown.featureGateTitle")}</AlertTitle>
            <AlertDescription>
              {t("bgpPeerDrilldown.featureGateDescription")}
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
              {detailStatus === "running" ? t("bgpPeerDrilldown.updating") : t("bgpPeerDrilldown.updateSshDetail")}
            </Button>
            <Badge variant="outline" className="font-mono">
              detail={detailStatus}
            </Badge>
          </div>
          {detailMutation.error ? (
            <p className="text-sm text-muted-foreground">
              {detailMutation.error instanceof Error ? detailMutation.error.message : t("bgpPeerDrilldown.sshDetailFailed")}
            </p>
          ) : null}
          {detailMutation.data ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">ssh_detail</Badge>
                <Badge variant="outline">{new Date(detailMutation.data.collectedAt).toLocaleString()}</Badge>
                <Badge variant="outline">{t("bgpPeerDrilldown.commandsCount", { count: detailMutation.data.commands.length })}</Badge>
              </div>
              <div className="max-h-96 overflow-auto rounded-md border border-border bg-muted/20 p-3">
                {detailMutation.data.evidence.map((item) => (
                  <div key={item.command} className="mb-4">
                    <div className="font-mono text-xs text-muted-foreground">{item.command}</div>
                    <pre className="mt-1 whitespace-pre-wrap text-xs">{item.error ?? (item.output || t("bgpPeerDrilldown.noOutput"))}</pre>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="drilldown" className="w-full">
        <TabsList>
          <TabsTrigger value="drilldown">{t("bgpPeerDrilldown.tabDrilldown")}</TabsTrigger>
          <TabsTrigger value="history">{t("bgpPeerDrilldown.tabHistory")}</TabsTrigger>
        </TabsList>
        <TabsContent value="drilldown" className="mt-4">
          <BgpPeerDrilldownView
            data={query.data}
            loading={query.isFetching && Boolean(submitted)}
            error={query.error}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <BgpDrilldownHistoryPanel
            deviceId={submitted?.deviceId ?? 0}
            peer={submitted?.peer ?? ""}
            items={historyQuery.data?.items}
            loading={historyQuery.isFetching && Boolean(submitted)}
            error={historyQuery.error}
            hasSubmitted={Boolean(submitted)}
          />
        </TabsContent>
      </Tabs>

      {BGP_POLICY_EDITOR_ENABLED ? (
        <BgpPolicyEditorModal
          open={policyEditorOpen}
          onOpenChange={setPolicyEditorOpen}
          deviceId={submitted?.deviceId ?? 0}
          deviceName={device?.hostname ?? `Device #${submitted?.deviceId ?? "—"}`}
          peerIp={submitted?.peer ?? ""}
          peerRemoteAs={peerSummary?.remoteAs ?? null}
          peerVrf={peerSummary?.vrf ?? null}
          drilldown={query.data ?? null}
          communityLibraryItems={communityLibraryQuery.data ?? []}
          communitySets={communitySetsQuery.data ?? []}
        />
      ) : null}
    </div>
  );
}

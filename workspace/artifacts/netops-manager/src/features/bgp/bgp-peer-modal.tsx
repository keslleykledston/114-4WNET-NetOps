import { useMemo, useState } from "react";
import type { Device } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Download, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";
import { useDiscoveryBgpPeerDetails, type DiscoveryBgpPeer, type DiscoveryBgpPeerDetails } from "@/features/device-discovery/discovery-api";
import { formatBgpUptime } from "./format-bgp-uptime";

interface BgpPeerModalProps {
  device: Device;
  peer: DiscoveryBgpPeer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabType = "policy" | "routes" | "references";

function getRoleLabel(role: string, t: (key: string) => string): string {
  const key = `bgp.roleLabels.${role}`;
  const label = t(key);
  return label === key ? t("bgp.peerModalExtended.defaultPeerName") : label;
}

export function BgpPeerModal({ device, peer, open, onOpenChange }: BgpPeerModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>("policy");
  const peerIp = peer?.peerIp ?? "";
  const deviceId = device.id;
  const fetchEnabled = open && !!peer;

  const details = useDiscoveryBgpPeerDetails(deviceId, peerIp, fetchEnabled);

  const detail = details.data;
  const data = detail?.peer ?? peer;
  const isLargeVolume = useMemo(() => {
    return Boolean(
      (data?.receivedPrefixes && data.receivedPrefixes > 5000) ||
      (data?.advertisedPrefixes && data.advertisedPrefixes > 5000)
    );
  }, [data?.receivedPrefixes, data?.advertisedPrefixes]);

  const tabLabels: Record<TabType, string> = {
    policy: t("bgp.peerModalExtended.tabPolicy"),
    routes: t("bgp.peerModalExtended.tabRoutes"),
    references: t("bgp.peerModalExtended.tabReferences"),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[95vh] overflow-hidden flex flex-col bg-slate-950 border border-slate-800 rounded-lg shadow-2xl">
        <DialogHeader className="flex-shrink-0 border-b border-slate-800 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-semibold text-slate-100">
                {data?.description || data?.name || t("bgp.peerModalExtended.defaultPeerTitle")}
              </DialogTitle>
              <DialogDescription className="font-mono text-sm text-slate-400 mt-2">
                <span className="text-slate-300">{peerIp}</span>
                <span className="text-slate-600"> · </span>
                <span className="text-slate-400">{data?.addressFamily || "—"}</span>
                <span className="text-slate-600"> · </span>
                <span className="text-slate-400">AS{data?.remoteAs ?? "—"}</span>
                <span className="text-slate-600"> · </span>
                <span className={cn(
                  "font-semibold",
                  data?.state === "Established" ? "text-emerald-400" : "text-amber-400"
                )}>
                  {data?.state || "—"}
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900">
          {details.isLoading ? (
            <div className="px-6 py-5 space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <div className="px-6 py-5 space-y-5">
              {data && (
                <>
                  <OperationalSummary peer={data} deviceName={device.hostname} primaryDirection={detail?.primaryDirection} />

                  {isLargeVolume && (
                    <div className="flex gap-3 rounded-lg bg-amber-500/10 border border-amber-500/25 p-4">
                      <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <div className="font-medium text-amber-200">{t("bgp.peerModalExtended.highVolumeTitle")}</div>
                        <p className="text-xs text-amber-300/70 mt-1">
                          {t("bgp.peerModalExtended.highVolumeDesc")}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="border-b border-slate-800 flex gap-6">
                    {(["policy", "routes", "references"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "pb-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                          activeTab === tab
                            ? "border-blue-500 text-blue-400"
                            : "border-transparent text-slate-400 hover:text-slate-300"
                        )}
                      >
                        {tabLabels[tab]}
                      </button>
                    ))}
                  </div>

                  <div className="pb-2">
                    {activeTab === "policy" && <PolicyTabContent peer={data} detail={detail} />}
                    {activeTab === "routes" && <RoutesTabContent peer={data} isLargeVolume={isLargeVolume} />}
                    {activeTab === "references" && <ReferencesTabContent peer={data} />}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OperationalSummary({
  peer,
  deviceName,
  primaryDirection,
}: {
  peer: DiscoveryBgpPeer;
  deviceName: string;
  primaryDirection?: "import" | "export" | "internal";
}) {
  const { t } = useTranslation();
  const isPrimaryExport = primaryDirection ? primaryDirection === "export" : peer.role === "provider" || peer.role === "ix" || peer.role === "cdn";
  const primaryPolicy = isPrimaryExport ? peer.exportPolicy : peer.importPolicy;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <OpCard label={t("bgp.peerModalExtended.device")} value={deviceName} />
        <OpCard label={t("bgp.peerModalExtended.role")} value={getRoleLabel(peer.role, t)} />
        <OpCard label={t("bgp.peerModalExtended.vrf")} value={peer.vrf || "—"} mono size="sm" />
        <OpCard label={t("bgp.peerModalExtended.session")} value={peer.sessionType} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <OpCard label={t("bgp.peerModalExtended.receivedRoutes")} value={peer.receivedPrefixes?.toLocaleString() ?? "—"} mono />
        <OpCard label={t("bgp.peerModalExtended.advertisedRoutes")} value={peer.advertisedPrefixes?.toLocaleString() ?? "—"} mono />
        <OpCard label={t("bgp.peerModalExtended.uptime")} value={formatBgpUptime(peer.uptime)} />
      </div>

      {primaryPolicy && (
        <div className="rounded-lg bg-slate-900/50 border border-slate-800 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            {isPrimaryExport ? t("bgp.peerModalExtended.exportPolicyPrincipal") : t("bgp.peerModalExtended.importPolicyPrincipal")}
          </div>
          <div className="font-mono text-xs text-slate-300 break-all">
            {primaryPolicy}
          </div>
        </div>
      )}
    </div>
  );
}

function OpCard({
  label,
  value,
  mono,
  size = "md",
}: {
  label: string;
  value: string;
  mono?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div className="rounded-lg bg-slate-900/50 border border-slate-800 p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn(
        "mt-2 truncate",
        mono && "font-mono text-xs",
        size === "md" && !mono && "text-sm",
        size === "sm" && "text-xs"
      )}>
        <span className="text-slate-200">{value}</span>
      </div>
    </div>
  );
}

function PolicyTabContent({ peer, detail }: { peer: DiscoveryBgpPeer; detail?: DiscoveryBgpPeerDetails }) {
  const { t } = useTranslation();
  const isPrimaryExport = detail?.primaryDirection ? detail.primaryDirection === "export" : peer.role === "provider" || peer.role === "ix" || peer.role === "cdn";
  const primaryPolicy = detail?.primaryPolicy ?? (isPrimaryExport ? peer.exportPolicy : peer.importPolicy);
  const secondaryPolicy = detail?.secondaryPolicy ?? (isPrimaryExport ? peer.importPolicy : peer.exportPolicy);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
          {isPrimaryExport ? t("bgp.peerModalExtended.exportPolicyPrincipal") : t("bgp.peerModalExtended.importPolicyPrincipal")}
        </div>
        <div className="rounded-lg bg-slate-900/50 border border-slate-800 p-4 font-mono text-xs leading-relaxed">
          <span className="text-slate-300">
            {primaryPolicy || "—"}
          </span>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
          {isPrimaryExport ? t("bgp.peerModalExtended.importPolicySecondary") : t("bgp.peerModalExtended.exportPolicySecondary")}
        </div>
        <div className="rounded-lg bg-slate-900/50 border border-slate-800 p-4 font-mono text-xs leading-relaxed">
          <span className="text-slate-300">
            {secondaryPolicy || "—"}
          </span>
        </div>
      </div>

      {detail?.routePolicyNodes?.length ? (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("bgp.peerModalExtended.nodes")}</div>
          {detail.routePolicyNodes.map((node, index) => (
            <div key={index} className="rounded-lg bg-slate-900/50 border border-slate-800 p-3 text-xs text-slate-300">
              {t("bgp.peerModalExtended.seq")} {node.sequence ?? "—"} · {node.action ?? "match"}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-slate-400 italic pt-2">
          {t("bgp.peerModalExtended.noNodesFound")}
        </div>
      )}
    </div>
  );
}

function RoutesTabContent({
  peer,
  isLargeVolume,
}: {
  peer: DiscoveryBgpPeer;
  isLargeVolume: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <RouteSection
        title={t("bgp.peerModalExtended.receivedRoutes")}
        total={peer.receivedPrefixes}
        isLargeVolume={isLargeVolume && peer.receivedPrefixes ? peer.receivedPrefixes > 5000 : false}
      />

      <RouteSection
        title={t("bgp.peerModalExtended.advertisedRoutes")}
        total={peer.advertisedPrefixes}
        isLargeVolume={isLargeVolume && peer.advertisedPrefixes ? peer.advertisedPrefixes > 5000 : false}
      />
    </div>
  );
}

function RouteSection({
  title,
  total,
  isLargeVolume,
}: {
  title: string;
  total?: number | null;
  isLargeVolume: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-slate-200">{title}</div>
          <div className="text-xs text-slate-400 mt-1">
            {t("bgp.peerModalExtended.totalCount", { count: total?.toLocaleString() ?? "—" })}
          </div>
        </div>
        {isLargeVolume ? (
          <Badge className="bg-red-500/20 text-red-300 border border-red-500/30">{t("bgp.peerModalExtended.highVolumeBadge")}</Badge>
        ) : (
          <Badge variant="outline" className="text-slate-400 border-slate-700">{t("bgp.peerModalExtended.statusOk")}</Badge>
        )}
      </div>

      {isLargeVolume ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            {t("bgp.peerModalExtended.highVolumeRoutesHint")}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs">
              <Download className="h-3 w-3 mr-2" />
              {t("bgp.peerModalExtended.sample50")}
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs">
              <Search className="h-3 w-3 mr-2" />
              {t("bgp.peerModalExtended.search")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-400 p-3 rounded-lg bg-slate-900/50 border border-slate-800 italic">
          {t("bgp.peerModalExtended.noRouteData")}
        </div>
      )}
    </div>
  );
}

function ReferencesTabContent({ peer }: { peer: DiscoveryBgpPeer }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <DetailLine label={t("bgp.peerModalExtended.refPeerIp")} value={peer.peerIp} mono />
      <DetailLine label={t("bgp.peerModalExtended.refRemoteAsn")} value={peer.remoteAs?.toString() ?? "—"} />
      <DetailLine label={t("bgp.peerModalExtended.refNameDescription")} value={peer.description || peer.name || "—"} />
      <DetailLine label={t("bgp.peerModalExtended.refAddressFamily")} value={peer.addressFamily} />
      <DetailLine label={t("bgp.peerModalExtended.refSessionType")} value={peer.sessionType} />
      <DetailLine label={t("bgp.peerModalExtended.vrf")} value={peer.vrf || "—"} />
      <DetailLine label={t("bgp.peerModalExtended.refImportPolicy")} value={peer.importPolicy || "—"} mono />
      <DetailLine label={t("bgp.peerModalExtended.refExportPolicy")} value={peer.exportPolicy || "—"} mono />
      <DetailLine label={t("bgp.peerModalExtended.refState")} value={peer.state || "—"} />
      <DetailLine label={t("bgp.peerModalExtended.refSource")} value={peer.source || "—"} />
      <DetailLine label={t("bgp.peerModalExtended.refConfidence")} value={peer.confidence || "—"} />
      <DetailLine label={t("bgp.peerModalExtended.refEvidence")} value={peer.evidence || "—"} mono />
    </div>
  );
}

function DetailLine({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-start gap-4 py-3 border-b border-slate-800/50">
      <span className="text-sm font-medium text-slate-400">{label}</span>
      <span className={cn("text-sm text-slate-200 text-right", mono && "font-mono text-xs break-all")}>
        {value}
      </span>
    </div>
  );
}

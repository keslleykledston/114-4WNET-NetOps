import { useMemo, useState } from "react";
import type { Device } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Download, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDiscoveryBgpPeerDetails, type DiscoveryBgpPeer, type DiscoveryBgpPeerDetails } from "@/features/device-discovery/discovery-api";
import { formatBgpUptime } from "./format-bgp-uptime";

interface BgpPeerModalProps {
  device: Device;
  peer: DiscoveryBgpPeer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabType = "policy" | "routes" | "references";

const roleLabel: Record<string, string> = {
  customer: "Cliente",
  provider: "Operadora",
  cdn: "CDN",
  ix: "IX",
  cdn_ix: "CDN/IX",
  ibgp: "iBGP",
};

export function BgpPeerModal({ device, peer, open, onOpenChange }: BgpPeerModalProps) {
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

  const defaultTab: TabType = useMemo(() => {
    if (!data) return "policy";
    return "policy";
  }, [data?.role]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[95vh] overflow-hidden flex flex-col bg-slate-950 border border-slate-800 rounded-lg shadow-2xl">
        <DialogHeader className="flex-shrink-0 border-b border-slate-800 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-semibold text-slate-100">
                {data?.name || data?.description || "BGP Peer"}
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
                  {/* RESUMO OPERACIONAL */}
                  <OperationalSummary peer={data} deviceName={device.hostname} primaryDirection={detail?.primaryDirection} />

                  {/* ALERTA DE VOLUME */}
                  {isLargeVolume && (
                    <div className="flex gap-3 rounded-lg bg-amber-500/10 border border-amber-500/25 p-4">
                      <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <div className="font-medium text-amber-200">Alto volume de rotas</div>
                        <p className="text-xs text-amber-300/70 mt-1">
                          Este peer possui muitas rotas. Use amostra ou busca para consultar detalhes.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* TABS */}
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
                        {tab === "policy" ? "Policy" : tab === "routes" ? "Rotas" : "Referências"}
                      </button>
                    ))}
                  </div>

                  {/* TAB CONTENT */}
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
  const isPrimaryExport = primaryDirection ? primaryDirection === "export" : peer.role === "provider" || peer.role === "ix" || peer.role === "cdn";
  const primaryPolicy = isPrimaryExport ? peer.exportPolicy : peer.importPolicy;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <OpCard label="Device" value={deviceName} />
        <OpCard label="Papel" value={roleLabel[peer.role] || "Cliente"} />
        <OpCard label="VRF" value={peer.vrf || "—"} mono size="sm" />
        <OpCard label="Session" value={peer.sessionType} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <OpCard label="Rotas Recebidas" value={peer.receivedPrefixes?.toLocaleString() ?? "—"} mono />
        <OpCard label="Rotas Anunciadas" value={peer.advertisedPrefixes?.toLocaleString() ?? "—"} mono />
        <OpCard label="Uptime" value={formatBgpUptime(peer.uptime)} />
      </div>

      {primaryPolicy && (
        <div className="rounded-lg bg-slate-900/50 border border-slate-800 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            {isPrimaryExport ? "Export Policy" : "Import Policy"} (Principal)
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
  const isPrimaryExport = detail?.primaryDirection ? detail.primaryDirection === "export" : peer.role === "provider" || peer.role === "ix" || peer.role === "cdn";
  const primaryPolicy = detail?.primaryPolicy ?? (isPrimaryExport ? peer.exportPolicy : peer.importPolicy);
  const secondaryPolicy = detail?.secondaryPolicy ?? (isPrimaryExport ? peer.importPolicy : peer.exportPolicy);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
          {isPrimaryExport ? "Export Policy (Principal)" : "Import Policy (Principal)"}
        </div>
        <div className="rounded-lg bg-slate-900/50 border border-slate-800 p-4 font-mono text-xs leading-relaxed">
          <span className="text-slate-300">
            {primaryPolicy || "—"}
          </span>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
          {isPrimaryExport ? "Import Policy (Secundária)" : "Export Policy (Secundária)"}
        </div>
        <div className="rounded-lg bg-slate-900/50 border border-slate-800 p-4 font-mono text-xs leading-relaxed">
          <span className="text-slate-300">
            {secondaryPolicy || "—"}
          </span>
        </div>
      </div>

      {detail?.routePolicyNodes?.length ? (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nodes</div>
          {detail.routePolicyNodes.map((node, index) => (
            <div key={index} className="rounded-lg bg-slate-900/50 border border-slate-800 p-3 text-xs text-slate-300">
              Seq {node.sequence ?? "—"} · {node.action ?? "match"}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-slate-400 italic pt-2">
          Nenhum node detalhado encontrado no snapshot estruturado.
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
  return (
    <div className="space-y-5">
      <RouteSection
        title="Rotas Recebidas"
        total={peer.receivedPrefixes}
        isLargeVolume={isLargeVolume && peer.receivedPrefixes ? peer.receivedPrefixes > 5000 : false}
      />

      <RouteSection
        title="Rotas Anunciadas"
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
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-slate-200">{title}</div>
          <div className="text-xs text-slate-400 mt-1">
            Total: {total?.toLocaleString() ?? "—"}
          </div>
        </div>
        {isLargeVolume ? (
          <Badge className="bg-red-500/20 text-red-300 border border-red-500/30">Alto volume</Badge>
        ) : (
          <Badge variant="outline" className="text-slate-400 border-slate-700">OK</Badge>
        )}
      </div>

      {isLargeVolume ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Volume elevado (&gt;5.000 rotas). Use amostra ou busca.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs">
              <Download className="h-3 w-3 mr-2" />
              Amostra (50)
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs">
              <Search className="h-3 w-3 mr-2" />
              Buscar
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-400 p-3 rounded-lg bg-slate-900/50 border border-slate-800 italic">
          Nenhum dado disponível (coleta em andamento ou stub)
        </div>
      )}
    </div>
  );
}

function ReferencesTabContent({ peer }: { peer: DiscoveryBgpPeer }) {
  return (
    <div className="space-y-4">
      <DetailLine label="Peer IP" value={peer.peerIp} mono />
      <DetailLine label="ASN Remoto" value={peer.remoteAs?.toString() ?? "—"} />
      <DetailLine label="Nome/Descrição" value={peer.name || peer.description || "—"} />
      <DetailLine label="Address Family" value={peer.addressFamily} />
      <DetailLine label="Tipo de Sessão" value={peer.sessionType} />
      <DetailLine label="VRF" value={peer.vrf || "—"} />
      <DetailLine label="Import Policy" value={peer.importPolicy || "—"} mono />
      <DetailLine label="Export Policy" value={peer.exportPolicy || "—"} mono />
      <DetailLine label="Estado" value={peer.state || "—"} />
      <DetailLine label="Source" value={peer.source || "—"} />
      <DetailLine label="Confidence" value={peer.confidence || "—"} />
      <DetailLine label="Evidence" value={peer.evidence || "—"} mono />
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

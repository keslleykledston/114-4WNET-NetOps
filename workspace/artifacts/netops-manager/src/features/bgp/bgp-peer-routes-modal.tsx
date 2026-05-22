import { useEffect, useState } from "react";
import type { Device } from "@workspace/api-client-react";
import type { DiscoveryBgpPeer } from "@/features/device-discovery/discovery-api";
import { useDiscoveryBgpPeerRoutes } from "@/features/device-discovery/discovery-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { AsPathTokens } from "@/components/AsPathTokens";

const PAGE_SIZE = 200;

interface BgpPeerRoutesModalProps {
  device: Device;
  peer: DiscoveryBgpPeer | null;
  direction: "received" | "advertised";
  isOpen: boolean;
  onClose: () => void;
}

export function BgpPeerRoutesModal({
  device,
  peer,
  direction,
  isOpen,
  onClose,
}: BgpPeerRoutesModalProps) {
  const [page, setPage] = useState(1);
  const peerIp = peer?.peerIp ?? "";
  const peerName = peer?.name || peer?.description || "Cliente";
  const deviceId = device.id;
  const fetchEnabled = isOpen && !!peer;

  useEffect(() => {
    if (isOpen) {
      setPage(1);
    }
  }, [isOpen, peerIp, direction]);

  const { data: routesData, isLoading } = useDiscoveryBgpPeerRoutes(
    deviceId,
    peerIp,
    direction,
    page,
    PAGE_SIZE,
    fetchEnabled
  );

  const isReceivedDirection = direction === "received";
  const title = isReceivedDirection
    ? `Prefixos recebidos (SSH) — ${peerName}`
    : `Prefixos anunciados (SSH) — ${peerName}`;
  const counterLabel = isReceivedDirection
    ? `Total de prefixos recebidos: ${routesData?.total ?? 0}`
    : `Total de prefixos anunciados: ${routesData?.total ?? 0}`;

  const handlePreviousPage = () => {
    setPage(p => Math.max(1, p - 1));
  };

  const handleNextPage = () => {
    setPage(p => p + 1);
  };

  const effectiveLimit = routesData?.limit ?? PAGE_SIZE;
  const totalRoutes = routesData?.total ?? 0;
  const currentPage = routesData?.page ?? page;
  const startIdx = totalRoutes > 0 ? (currentPage - 1) * effectiveLimit + 1 : 0;
  const endIdx = Math.min(currentPage * effectiveLimit, totalRoutes);
  const pageRange = `${startIdx}–${endIdx} de ${totalRoutes}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col bg-slate-950 border border-slate-800 rounded-lg shadow-2xl">
        <DialogHeader className="flex-shrink-0 border-b border-slate-800 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-semibold text-slate-100">
                {title}
              </DialogTitle>
              <div className="text-xs text-slate-400 mt-2">
                <span className="text-slate-300 font-mono">{peerIp}</span>
                <span className="text-slate-600"> · </span>
                <span>Principal</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900">
          {isLoading ? (
            <div className="px-6 py-5 space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <div className="px-6 py-5 space-y-5">
              {/* Counter */}
              <div className="text-sm font-medium text-slate-300">
                {counterLabel}
              </div>

              {/* Excess Warning */}
              {routesData?.excessWarning && (
                <div className="flex gap-3 rounded-lg bg-amber-500/10 border border-amber-500/25 p-4">
                  <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <div className="font-medium text-amber-200">Alto volume de prefixos</div>
                    <p className="text-amber-300/70 mt-1">
                      {routesData.warningMessage ||
                        "Esta consulta foi limitada a 200 prefixos por página para proteger o dispositivo."}
                    </p>
                  </div>
                </div>
              )}

              {/* Routes Table */}
              <div className="space-y-2">
                {routesData?.items && routesData.items.length > 0 ? (
                  routesData.items.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg bg-slate-900/50 border border-slate-800 p-3 text-xs"
                    >
                      <span className="font-mono text-slate-200 break-all shrink-0">
                        {item.prefix}
                      </span>
                      <span className="text-slate-600 hidden sm:inline">·</span>
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="text-slate-500 uppercase text-[10px] tracking-wide shrink-0">
                          AS-PATH
                        </span>
                        <AsPathTokens asPath={item.asPath?.join(" ")} compact />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-400 p-4 rounded-lg bg-slate-900/50 border border-slate-800 italic">
                    Nenhum prefixo encontrado
                  </div>
                )}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <div className="text-xs text-slate-400">
                  {pageRange}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={page === 1}
                    onClick={handlePreviousPage}
                  >
                    <ChevronLeft className="h-3 w-3 mr-1" />
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={!routesData?.hasNextPage}
                    onClick={handleNextPage}
                  >
                    Próxima
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

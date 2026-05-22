import type { Device } from "@workspace/api-client-react";
import type { DiscoveryBgpPeer } from "@/features/device-discovery/discovery-api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface BgpPeerDetailModalProps {
  device: Device;
  peer: DiscoveryBgpPeer | null;
  isOpen: boolean;
  onClose: () => void;
}

function peerTableDisplayName(peer: DiscoveryBgpPeer): string {
  if (peer?.name && String(peer.name).trim()) {
    return String(peer.name).trim();
  }
  return peer?.description || "—";
}

function peerDetailModalTitle(peer: DiscoveryBgpPeer | null): string {
  if (!peer) return "";
  const name = peerTableDisplayName(peer);
  return `AS${peer.remoteAs ?? "—"}-${name}`;
}

export function BgpPeerDetailModal({
  device,
  peer,
  isOpen,
  onClose,
}: BgpPeerDetailModalProps) {
  if (!peer) return null;

  const title = peerDetailModalTitle(peer);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-xl bg-slate-950 border border-slate-800 rounded-lg shadow-2xl">
        <DialogHeader className="flex-shrink-0 border-b border-slate-800 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-lg font-semibold text-slate-100">
              {title}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-3">
          {/* Peer IP */}
          <div className="rounded-lg bg-slate-900/50 border border-slate-800 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Peer IP
            </p>
            <p className="font-mono text-sm text-slate-200">{peer.peerIp}</p>
          </div>


          {/* Received prefix counter */}
          <div className="rounded-lg bg-slate-900/50 border border-slate-800 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Received Routes
            </p>
            <p className="font-mono text-sm text-purple-400">
              {peer.receivedPrefixes ?? "—"}
            </p>
          </div>

          {/* Advertised prefix counter */}
          <div className="rounded-lg bg-slate-900/50 border border-slate-800 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Advertised Routes
            </p>
            <p className="font-mono text-sm text-blue-400">
              {peer.advertisedPrefixes ?? "—"}
            </p>
          </div>

          {/* Import Policy */}
          {peer.importPolicy && (
            <div className="rounded-lg bg-slate-900/50 border border-slate-800 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Route-Policy (Import)
              </p>
              <p className="font-mono text-xs text-slate-300 break-all">
                {peer.importPolicy}
              </p>
            </div>
          )}

          {/* Export Policy */}
          {peer.exportPolicy && (
            <div className="rounded-lg bg-slate-900/50 border border-slate-800 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Route-Policy (Export)
              </p>
              <p className="font-mono text-xs text-slate-300 break-all">
                {peer.exportPolicy}
              </p>
            </div>
          )}

          {/* Notes */}
          <p className="text-xs text-slate-400 leading-relaxed pt-2">
            Route-policy names may not exist in BGP-4-MIB OIDs used in SNMP discovery.
            These prefix counters are persisted when Huawei SSH collection succeeds and{" "}
            <span className="font-mono text-slate-300">display bgp … peer verbose</span> is available.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "@/i18n";
import type { TranslateFn } from "@/features/l2-circuits/l2-circuit-badges";
import { cn } from "@/lib/utils";
import type { L2Circuit, L2Finding, L2FindingCode, L2VsiPeer } from "./l2-circuits-api";
import { circuitTypeGroup } from "./l2-circuit-badges";

export function findingShortLabel(code: L2FindingCode, t?: TranslateFn): string {
  const key = `l2Circuits.tableCells.findingCodes.${code}`;
  if (t) {
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return code.replace(/_/g, " ");
}

function isPeerDown(peer: L2VsiPeer): boolean {
  const session = peer.session_state?.toLowerCase().trim();
  const pw = peer.pw_state?.toLowerCase().trim();
  return session === "down" || pw === "down";
}

function firstPeerIp(circuit: L2Circuit): string | undefined {
  return circuit.peers?.[0]?.peer_ip ?? circuit.primaryPeerIp ?? circuit.peerIp ?? undefined;
}

function vsiPeerList(circuit: L2Circuit): L2VsiPeer[] {
  if (circuit.peers?.length) return circuit.peers;
  const ip = circuit.primaryPeerIp ?? circuit.peerIp;
  if (!ip) return [];
  return [{ peer_ip: ip, session_state: circuit.operStatus === "DOWN" ? "down" : "up" }];
}

export function PeerCell({ circuit }: { circuit: L2Circuit }) {
  const { t } = useTranslation();
  const isVsi = circuitTypeGroup(circuit.circuitType) === "vsi";
  const peers = isVsi ? vsiPeerList(circuit) : [];
  const displayPeer = isVsi ? firstPeerIp(circuit) : circuit.peerIp ?? undefined;

  if (isVsi && peers.length > 1) {
    return (
      <div className="flex items-center gap-1 min-w-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <span className="font-mono text-xs truncate" title={displayPeer}>
          {displayPeer ?? "—"}
        </span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-5 w-5 shrink-0 rounded-sm"
              aria-label={t("l2Circuits.tableCells.viewPeersAria", { count: peers.length })}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("l2Circuits.tableCells.peersTitle", { count: peers.length })}
            </p>
            <ul className="space-y-0.5">
              {peers.map((peer) => (
                <li key={peer.peer_ip} className="flex items-center gap-2 rounded px-1 py-0.5 font-mono text-xs">
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", isPeerDown(peer) ? "bg-red-500" : "bg-green-500")}
                    title={isPeerDown(peer) ? "DOWN" : "UP"}
                  />
                  <span className="truncate">{peer.peer_ip}</span>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <span className="font-mono text-xs truncate block max-w-[140px]" title={displayPeer ?? circuit.peerIp ?? undefined}>
      {displayPeer ?? circuit.peerIp ?? "—"}
    </span>
  );
}

function findingLabelClass(finding: L2Finding): string {
  if (finding.severity === "error") return "text-red-300";
  if (finding.severity === "warning") return "text-amber-300";
  return "text-muted-foreground";
}

export function FindingsCell({ findings }: { findings: L2Finding[] }) {
  const { t } = useTranslation();

  if (findings.length === 0) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }

  const countDigits = String(findings.length).length;
  const boxWidth = countDigits <= 1 ? "w-5" : countDigits === 2 ? "w-6" : "w-7";

  const hasError = findings.some((f) => f.severity === "error");
  const hasWarning = findings.some((f) => f.severity === "warning");
  const countClass = hasError
    ? "border-red-500/40 bg-red-500/10 text-red-300"
    : hasWarning
      ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
      : "border-blue-500/40 bg-blue-500/10 text-blue-300";

  return (
    <div className="flex items-start gap-1.5 min-w-0">
      <span
        className={cn(
          "inline-flex h-5 shrink-0 items-center justify-center rounded border text-[10px] font-semibold leading-none",
          boxWidth,
          countClass,
        )}
        title={t("l2Circuits.tableCells.findingsCountTitle", { count: findings.length })}
      >
        {findings.length}
      </span>
      <div className="flex min-w-0 flex-col gap-0 leading-none">
        {findings.map((finding, index) => (
          <span
            key={`${finding.code}-${index}`}
            className={cn("truncate text-[10px] font-medium uppercase tracking-wide", findingLabelClass(finding))}
            title={finding.message}
          >
            {findingShortLabel(finding.code, t)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DeviceCell({ hostname }: { hostname?: string }) {
  return (
    <span className="text-sm whitespace-nowrap" title={hostname}>
      {hostname ?? "—"}
    </span>
  );
}

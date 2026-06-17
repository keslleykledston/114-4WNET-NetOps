import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Device } from "@workspace/api-client-react";
import type { DiscoveryBgpPeer } from "@/features/device-discovery/discovery-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, ClipboardCopy, Download, Info, Loader2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DependencyRiskBadge } from "./dependency-risk-badge";
import { analyzeBgpPeerCleanup, exportBgpPeerCleanupAnalysis } from "./bgp-peer-cleanup-api";
import type { BgpPeerCleanupAnalysis } from "@/features/bgp-cleanup-types";
import { ChangePlanDetailsModal } from "@/features/change-plans/change-plan-details-modal";
import { cn } from "@/lib/utils";

interface BgpPeerCleanupModalProps {
  device: Device;
  peer: DiscoveryBgpPeer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function copyToClipboard(text: string) {
  return navigator.clipboard.writeText(text);
}

function joinCommands(commands: string[]) {
  return commands.join("\n");
}

function downloadMarkdown(filename: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DependencyBlock({
  title,
  items,
  tone,
  subtitle,
}: {
  title: string;
  items: BgpPeerCleanupAnalysis["dependencies"]["exclusive" | "shared" | "global" | "ambiguous"];
  tone: "emerald" | "amber" | "sky" | "red";
  subtitle?: string;
}) {
  const border = tone === "emerald"
    ? "border-emerald-500/20 bg-emerald-500/5"
    : tone === "amber"
      ? "border-amber-500/20 bg-amber-500/5"
      : tone === "sky"
        ? "border-sky-500/20 bg-sky-500/5"
        : "border-red-500/20 bg-red-500/5";
  const text = tone === "emerald"
    ? "text-emerald-200"
    : tone === "amber"
      ? "text-amber-200"
      : tone === "sky"
        ? "text-sky-200"
        : "text-red-200";
  return (
    <div className={`rounded-lg border p-4 ${border}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${text}`}>{title}</div>
      {subtitle ? <div className="mt-1 text-[11px] text-slate-400">{subtitle}</div> : null}
      <div className="mt-3 space-y-2">
        {items.length ? items.map((item) => (
          <div key={`${item.type}:${item.name}`} className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-slate-200">{item.type}</span>
              <span className="font-mono text-xs text-slate-300">{item.name}</span>
              <Badge variant="outline" className="text-[10px] uppercase">{item.status}</Badge>
            </div>
            <div className="mt-1 text-xs text-slate-400">{item.reason ?? item.evidence}</div>
            {item.users.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.users.map((user) => (
                  <Badge key={`${item.name}:${user.peerIp}:${user.afi}`} variant="outline" className="text-[10px]">
                    {user.peerIp} · {user.afi}/{user.vrf ?? "global"} · {user.state}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        )) : (
          <div className="text-sm text-slate-400">Nenhum item nesta categoria.</div>
        )}
      </div>
    </div>
  );
}

export function BgpPeerCleanupModal({ device, peer, open, onOpenChange }: BgpPeerCleanupModalProps) {
  const { toast } = useToast();
  const requestSeq = useRef(0);
  const [analysis, setAnalysis] = useState<BgpPeerCleanupAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showSshRefreshEvidence, setShowSshRefreshEvidence] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  async function runAnalysis(targetPeer: DiscoveryBgpPeer, validateReadOnly = false) {
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    setAnalysis(null);
    setLoadError(null);
    setLoading(true);

    try {
      const result = await analyzeBgpPeerCleanup({
        deviceId: device.id,
        peerIp: targetPeer.peerIp,
        validateReadOnly,
      });
      if (requestSeq.current !== requestId) return;
      setAnalysis(result);
    } catch (error) {
      if (requestSeq.current !== requestId) return;
      setLoadError(error instanceof Error ? error.message : "Erro desconhecido");
    } finally {
      if (requestSeq.current === requestId) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!open || !peer || peer.state === "Established") {
      setAnalysis(null);
      setLoading(false);
      setLoadError(null);
      setShowSshRefreshEvidence(false);
      return;
    }

    setShowSshRefreshEvidence(false);
    void runAnalysis(peer, false);
  }, [device.id, open, peer?.peerIp, peer?.state]);

  const canPlan = peer?.state !== "Established";

  async function handleCopyScript() {
    if (!analysis) return;
    await copyToClipboard(joinCommands(analysis.script.removalCommands));
    toast({ title: "Script copiado", description: "Trecho de remoção copiado para a área de transferência." });
  }

  async function handleCopyValidations() {
    if (!analysis) return;
    const payload = [
      "## Validation Before",
      joinCommands(analysis.script.validationBefore),
      "",
      "## Validation After",
      joinCommands(analysis.script.validationAfter),
    ].join("\n");
    await copyToClipboard(payload);
    toast({ title: "Validações copiadas", description: "Comandos de validação copiados." });
  }

  async function handleExportMarkdown() {
    if (!analysis) return;
    const exported = await exportBgpPeerCleanupAnalysis(analysis.analysisId);
    downloadMarkdown(`bgp-peer-cleanup-${analysis.peerIp}.md`, exported.markdown);
    toast({ title: "Markdown exportado", description: "Arquivo gerado para revisão humana." });
  }

  async function handleRefreshAnalysis() {
    if (!peer || peer.state === "Established") return;
    setLoadError(null);
    setShowSshRefreshEvidence(true);
    await runAnalysis(peer, true);
    toast({ title: "Resultado atualizado", description: "A coleta, o SSH e o script foram recalculados." });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-0">
        <DialogHeader className="flex items-center justify-between gap-4 border-b border-slate-800 px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
              <ShieldAlert className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div>
              <DialogTitle className="text-[15px] font-semibold text-slate-100">
                Planejamento de Remoção de Peer
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Nenhum comando será executado. Script apenas para revisão humana.
              </DialogDescription>
              {loading ? (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/80 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300">
                  <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                  Processando consulta / script
                </div>
              ) : null}
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            device #{device.id}
          </Badge>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
            <ShieldAlert className="h-4 w-4 text-amber-300" />
            <AlertTitle className="text-amber-100">Modo somente planejamento</AlertTitle>
            <AlertDescription className="text-amber-100/90">
              Nenhum comando será executado pelo sistema. O resultado serve apenas para revisão e cópia manual.
            </AlertDescription>
          </Alert>

          {!canPlan ? (
            <Alert className="border-red-500/30 bg-red-500/10 text-red-100">
              <ShieldAlert className="h-4 w-4 text-red-300" />
              <AlertTitle className="text-red-100">Proteção ativa</AlertTitle>
              <AlertDescription className="text-red-100/90">
                Peer Established protegido: nenhum plano de remoção será apresentado.
              </AlertDescription>
            </Alert>
          ) : null}

          {!canPlan ? null : loading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : loadError ? (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Falha ao analisar peer</AlertTitle>
              <AlertDescription>
                {loadError}
              </AlertDescription>
            </Alert>
          ) : analysis ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoCard label="Peer" value={analysis.peerIp} mono />
                <InfoCard label="VRF" value={analysis.vrf ?? "global"} mono />
                <InfoCard label="Estado" value={analysis.state} />
                <InfoCard label="Risco" value={<DependencyRiskBadge risk={analysis.riskLevel} />} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <InfoCard label="Recomendação" value={analysis.recommendation} />
                <InfoCard label="Twin" value={analysis.twin ? `${analysis.twin.peerIp} · ${analysis.twin.afi} · ${analysis.twin.state}` : "—"} mono />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <InfoCard label="Import policies" value={analysis.importPolicies.length ? analysis.importPolicies.join(", ") : "—"} mono wrap />
                <InfoCard label="Export policies" value={analysis.exportPolicies.length ? analysis.exportPolicies.join(", ") : "—"} mono wrap />
              </div>

              {showSshRefreshEvidence && analysis.sshRefresh?.enabled ? (
                <Alert className="border-slate-700 bg-slate-900/70 text-slate-100">
                  <Loader2 className="h-4 w-4 text-slate-300" />
                  <AlertTitle className="text-slate-100">Evidência SSH reexecutada</AlertTitle>
                  <AlertDescription className="space-y-3 text-slate-200">
                    <div className="grid gap-3 md:grid-cols-3">
                      <InfoCard label="Comandos" value={`${analysis.sshRefresh.commandCount}`} mono />
                      <InfoCard label="Respondidos" value={`${analysis.sshRefresh.executedCount}`} mono />
                      <InfoCard label="Warnings" value={`${analysis.sshRefresh.warnings.length}`} mono />
                    </div>
                    <div className="rounded-md border border-slate-800 bg-[#0f111a] p-3 text-xs text-slate-300">
                      <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Comandos SSH</div>
                      <pre className="whitespace-pre-wrap break-words font-mono">{analysis.sshRefresh.commands.join("\n") || "—"}</pre>
                    </div>
                    {analysis.sshRefresh.warnings.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-4 text-xs text-amber-200">
                        {analysis.sshRefresh.warnings.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              {analysis.blockedReasons.length > 0 ? (
                <Alert className="border-red-500/30 bg-red-500/10 text-red-100">
                  <AlertTitle className="text-red-100">Revisão humana obrigatória</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4">
                      {analysis.blockedReasons.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}

              {analysis.warnings.length > 0 ? (
                <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
                  <AlertTitle className="text-amber-100">Warnings</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4">
                      {analysis.warnings.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-2">
                <DependencyBlock title="Dependências exclusivas" items={analysis.dependencies.exclusive} tone="emerald" />
                <DependencyBlock title="Dependências compartilhadas" items={analysis.dependencies.shared} tone="amber" />
                <DependencyBlock
                  title="Globais / Preservados"
                  subtitle="Dependência global compartilhada por desenho operacional."
                  items={analysis.dependencies.global}
                  tone="sky"
                />
                <DependencyBlock title="Dependências ambíguas" items={analysis.dependencies.ambiguous} tone="red" />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <CodeBlock
                  title="Script sugerido"
                  content={analysis.script.removalCommands.join("\n")}
                  emptyMessage={analysis.recommendation === "skip"
                    ? "Nenhum comando de remoção sugerido. Revisão humana obrigatória."
                    : "Sem comandos de remoção sugeridos."}
                />
                <CodeBlock title="Validações antes" content={analysis.script.validationBefore.join("\n")} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <CodeBlock title="Validações depois" content={analysis.script.validationAfter.join("\n")} />
                <CodeBlock title="SHA-256" content={analysis.script.sha256} monoSmall />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 px-6 py-4">
          <Button variant="outline" onClick={handleRefreshAnalysis} disabled={!canPlan || loading}>
            <Loader2 className={cn("h-4 w-4", loading && "animate-spin")} />
            Atualizar via SSH
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="Detalhes do Change Plan"
            aria-label="Detalhes do Change Plan"
            disabled={!analysis?.changePlanId}
            onClick={() => setDetailsOpen(true)}
          >
            <Info className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleCopyScript} disabled={!analysis}>
            <ClipboardCopy className="h-4 w-4" />
            Copiar script
          </Button>
          <Button variant="outline" onClick={handleCopyValidations} disabled={!analysis}>
            <CheckCircle2 className="h-4 w-4" />
            Copiar validações
          </Button>
          <Button variant="secondary" onClick={handleExportMarkdown} disabled={!analysis}>
            <Download className="h-4 w-4" />
            Exportar Markdown
          </Button>
          <Button variant="default" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {!canPlan ? (
            <span className="w-full text-right text-xs text-red-300">
              Peer Established não pode ser planejado para remoção
            </span>
          ) : null}
        </div>
      </DialogContent>
      <ChangePlanDetailsModal
        changePlanId={analysis?.changePlanId ?? null}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </Dialog>
  );
}

function InfoCard({
  label,
  value,
  mono,
  wrap,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("mt-1 text-sm text-slate-200", mono && "font-mono text-xs", wrap && "whitespace-pre-wrap break-words")}>{value}</div>
    </div>
  );
}

function CodeBlock({
  title,
  content,
  monoSmall,
  emptyMessage,
}: {
  title: string;
  content: string;
  monoSmall?: boolean;
  emptyMessage?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{title}</div>
      <pre className={cn("mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-slate-800 bg-[#0f111a] p-3 text-xs text-slate-200", monoSmall && "text-[11px]")}>
        {content || emptyMessage || "—"}
      </pre>
    </div>
  );
}

import { useEffect, type ReactNode } from "react";
import type { Device } from "@workspace/api-client-react";
import type { DiscoveryBgpPeer } from "@/features/device-discovery/discovery-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, ClipboardCopy, Download, Loader2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n";
import { DependencyRiskBadge } from "./dependency-risk-badge";
import {
  exportBgpPeerCleanupAnalysis,
  useBgpPeerCleanupAnalyze,
} from "./bgp-peer-cleanup-api";
import type { BgpPeerCleanupAnalysis } from "@/features/bgp-cleanup-types";
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
  emptyMessage,
}: {
  title: string;
  items: BgpPeerCleanupAnalysis["dependencies"]["exclusive" | "shared" | "ambiguous"];
  tone: "emerald" | "amber" | "red";
  emptyMessage: string;
}) {
  const border = tone === "emerald" ? "border-emerald-500/20 bg-emerald-500/5" : tone === "amber" ? "border-amber-500/20 bg-amber-500/5" : "border-red-500/20 bg-red-500/5";
  const text = tone === "emerald" ? "text-emerald-200" : tone === "amber" ? "text-amber-200" : "text-red-200";
  return (
    <div className={`rounded-lg border p-4 ${border}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${text}`}>{title}</div>
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
          <div className="text-sm text-slate-400">{emptyMessage}</div>
        )}
      </div>
    </div>
  );
}

export function BgpPeerCleanupModal({ device, peer, open, onOpenChange }: BgpPeerCleanupModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const analyze = useBgpPeerCleanupAnalyze();

  useEffect(() => {
    if (!open || !peer || peer.state === "Established") return;
    analyze.mutate({ deviceId: device.id, peerIp: peer.peerIp });
  }, [analyze, device.id, open, peer]);

  const analysis = analyze.data ?? null;
  const canPlan = peer?.state !== "Established";

  async function handleCopyScript() {
    if (!analysis) return;
    await copyToClipboard(joinCommands(analysis.script.removalCommands));
    toast({
      title: t("bgp.peerCleanupModal.toastScriptCopied"),
      description: t("bgp.peerCleanupModal.toastScriptCopiedDesc"),
    });
  }

  async function handleCopyValidations() {
    if (!analysis) return;
    const payload = [
      t("bgp.peerCleanupModal.validationBeforeHeader"),
      joinCommands(analysis.script.validationBefore),
      "",
      t("bgp.peerCleanupModal.validationAfterHeader"),
      joinCommands(analysis.script.validationAfter),
    ].join("\n");
    await copyToClipboard(payload);
    toast({
      title: t("bgp.peerCleanupModal.toastValidationsCopied"),
      description: t("bgp.peerCleanupModal.toastValidationsCopiedDesc"),
    });
  }

  async function handleExportMarkdown() {
    if (!analysis) return;
    const exported = await exportBgpPeerCleanupAnalysis(analysis.analysisId);
    downloadMarkdown(`bgp-peer-cleanup-${analysis.peerIp}.md`, exported.markdown);
    toast({
      title: t("bgp.peerCleanupModal.toastMarkdownExported"),
      description: t("bgp.peerCleanupModal.toastMarkdownExportedDesc"),
    });
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
                {t("bgp.peerCleanupModal.title")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t("bgp.peerCleanupModal.description")}
              </DialogDescription>
              {analyze.isPending ? (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/80 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300">
                  <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                  {t("bgp.peerCleanupModal.processing")}
                </div>
              ) : null}
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {t("bgp.peerCleanupModal.device", { id: device.id })}
          </Badge>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
            <ShieldAlert className="h-4 w-4 text-amber-300" />
            <AlertTitle className="text-amber-100">{t("bgp.peerCleanupModal.planningOnlyTitle")}</AlertTitle>
            <AlertDescription className="text-amber-100/90">
              {t("bgp.peerCleanupModal.planningOnlyDesc")}
            </AlertDescription>
          </Alert>

          {!canPlan ? (
            <Alert className="border-red-500/30 bg-red-500/10 text-red-100">
              <ShieldAlert className="h-4 w-4 text-red-300" />
              <AlertTitle className="text-red-100">{t("bgp.peerCleanupModal.protectionTitle")}</AlertTitle>
              <AlertDescription className="text-red-100/90">
                {t("bgp.peerCleanupModal.protectionDesc")}
              </AlertDescription>
            </Alert>
          ) : null}

          {!canPlan ? null : analyze.isPending ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : analyze.error ? (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>{t("bgp.peerCleanupModal.analyzeFailed")}</AlertTitle>
              <AlertDescription>
                {analyze.error instanceof Error ? analyze.error.message : t("bgp.peerCleanupModal.unknownError")}
              </AlertDescription>
            </Alert>
          ) : analysis ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoCard label={t("bgp.peerCleanupModal.peer")} value={analysis.peerIp} mono />
                <InfoCard label={t("bgp.peerCleanupModal.vrf")} value={analysis.vrf ?? "global"} mono />
                <InfoCard label={t("bgp.peerCleanupModal.state")} value={analysis.state} />
                <InfoCard label={t("bgp.peerCleanupModal.risk")} value={<DependencyRiskBadge risk={analysis.riskLevel} />} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <InfoCard label={t("bgp.peerCleanupModal.recommendation")} value={analysis.recommendation} />
                <InfoCard label={t("bgp.peerCleanupModal.twin")} value={analysis.twin ? `${analysis.twin.peerIp} · ${analysis.twin.afi} · ${analysis.twin.state}` : "—"} mono />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <InfoCard label={t("bgp.peerCleanupModal.importPolicies")} value={analysis.importPolicies.length ? analysis.importPolicies.join(", ") : "—"} mono wrap />
                <InfoCard label={t("bgp.peerCleanupModal.exportPolicies")} value={analysis.exportPolicies.length ? analysis.exportPolicies.join(", ") : "—"} mono wrap />
              </div>

              {analysis.blockedReasons.length > 0 ? (
                <Alert className="border-red-500/30 bg-red-500/10 text-red-100">
                  <AlertTitle className="text-red-100">{t("bgp.peerCleanupModal.humanReviewRequired")}</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4">
                      {analysis.blockedReasons.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}

              {analysis.warnings.length > 0 ? (
                <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
                  <AlertTitle className="text-amber-100">{t("bgp.peerCleanupModal.warnings")}</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4">
                      {analysis.warnings.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-3">
                <DependencyBlock title={t("bgp.peerCleanupModal.exclusiveDeps")} items={analysis.dependencies.exclusive} tone="emerald" emptyMessage={t("bgp.peerCleanupModal.noItemsInCategory")} />
                <DependencyBlock title={t("bgp.peerCleanupModal.sharedDeps")} items={analysis.dependencies.shared} tone="amber" emptyMessage={t("bgp.peerCleanupModal.noItemsInCategory")} />
                <DependencyBlock title={t("bgp.peerCleanupModal.ambiguousDeps")} items={analysis.dependencies.ambiguous} tone="red" emptyMessage={t("bgp.peerCleanupModal.noItemsInCategory")} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <CodeBlock
                  title={t("bgp.peerCleanupModal.suggestedScript")}
                  content={analysis.script.removalCommands.join("\n")}
                  emptyMessage={analysis.recommendation === "skip"
                    ? t("bgp.peerCleanupModal.noRemovalSuggested")
                    : t("bgp.peerCleanupModal.noRemovalCommands")}
                />
                <CodeBlock title={t("bgp.peerCleanupModal.validationBefore")} content={analysis.script.validationBefore.join("\n")} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <CodeBlock title={t("bgp.peerCleanupModal.validationAfter")} content={analysis.script.validationAfter.join("\n")} />
                <CodeBlock title="SHA-256" content={analysis.script.sha256} monoSmall />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 px-6 py-4">
          <Button variant="outline" onClick={handleCopyScript} disabled={!analysis}>
            <ClipboardCopy className="h-4 w-4" />
            {t("bgp.peerCleanupModal.copyScript")}
          </Button>
          <Button variant="outline" onClick={handleCopyValidations} disabled={!analysis}>
            <CheckCircle2 className="h-4 w-4" />
            {t("bgp.peerCleanupModal.copyValidations")}
          </Button>
          <Button variant="secondary" onClick={handleExportMarkdown} disabled={!analysis}>
            <Download className="h-4 w-4" />
            {t("bgp.peerCleanupModal.exportMarkdown")}
          </Button>
          <Button variant="default" onClick={() => onOpenChange(false)}>
            {t("bgp.peerCleanupModal.close")}
          </Button>
          {!canPlan ? (
            <span className="w-full text-right text-xs text-red-300">
              {t("bgp.peerCleanupModal.establishedCannotPlan")}
            </span>
          ) : null}
        </div>
      </DialogContent>
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

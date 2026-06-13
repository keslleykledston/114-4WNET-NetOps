import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import type { AuthRole } from "@/components/auth-provider";
import { applyReviewAction, getChangePlan } from "./change-plan-api";
import type { ChangePlanDetail, ChangePlanItemRecord, ChangePlanWorkflowStatus, ReviewAction } from "./change-plan-types";
import type { ProposedCommandSet } from "../bgp-announcements/announcement-types";
import {
  REVIEW_ACTION_LABELS,
  WORKFLOW_STATUS_LABELS,
  availableReviewActions,
  reviewActionRequiresNote,
  workflowStatusTone,
} from "./change-plan-workflow-utils";
import { cn } from "@/lib/utils";
import {
  formatProposedCommandsClipboardText,
  proposedCommandConfidenceLabel,
} from "../bgp-announcements/proposed-commands";

interface ChangePlanDetailsModalProps {
  changePlanId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userRole?: AuthRole;
  onUpdated?: () => void;
}

const SECTIONS: Array<{
  title: string;
  filter: (item: ChangePlanItemRecord) => boolean;
  subtitle?: string;
}> = [
  { title: "Peer", filter: (item) => item.itemType === "bgp-peer" },
  { title: "Route-policies", filter: (item) => item.itemType === "route-policy" },
  { title: "Prefix-lists", filter: (item) => item.itemType === "ip-prefix" || item.itemType === "ipv6-prefix" },
  { title: "Community-filters", filter: (item) => item.itemType === "community-filter" },
  { title: "Community-lists", filter: (item) => item.itemType === "community-list" },
  { title: "As-path filters", filter: (item) => item.itemType === "as-path-filter" || item.itemType === "extcommunity-filter" },
  {
    title: "Dependências globais preservadas",
    filter: (item) => item.classification === "global",
    subtitle: "Dependência global compartilhada por desenho operacional.",
  },
];

function classificationTone(status: ChangePlanItemRecord["classification"]) {
  switch (status) {
    case "exclusive":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "shared":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "global":
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
    default:
      return "border-red-500/30 bg-red-500/10 text-red-200";
  }
}

function ItemCard({ item }: { item: ChangePlanItemRecord }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate-300">{item.itemType}</span>
        <span className="font-mono text-sm text-slate-100">{item.itemName}</span>
        <Badge variant="outline" className={cn("text-[10px] uppercase", classificationTone(item.classification))}>
          {item.classification}
        </Badge>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-slate-400">
        <div>Usage count: <span className="font-mono text-slate-200">{item.usageCount}</span></div>
        <div>Será removido: <span className={item.willBeRemoved ? "text-red-300" : "text-emerald-300"}>{item.willBeRemoved ? "SIM" : "NÃO"}</span></div>
        {item.reason ? <div>Motivo: {item.reason}</div> : null}
      </div>
      {item.users.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.users.map((user) => (
            <Badge key={`${item.itemName}:${user.peerIp ?? user.label}:${user.afi ?? "na"}`} variant="outline" className="text-[10px]">
              {user.peerIp ?? user.label ?? "—"}
              {user.afi ? ` · ${user.afi}/${user.vrf ?? "global"}` : ""}
              {user.state ? ` · ${user.state}` : ""}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ChangePlanDetailsModal({
  changePlanId,
  open,
  onOpenChange,
  userRole = "viewer",
  onUpdated,
}: ChangePlanDetailsModalProps) {
  const [plan, setPlan] = useState<ChangePlanDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<ReviewAction | null>(null);
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const workflowStatus: ChangePlanWorkflowStatus = plan?.workflowStatus ?? "draft";
  const actions = useMemo(
    () => availableReviewActions(userRole, workflowStatus),
    [userRole, workflowStatus],
  );

  useEffect(() => {
    if (!open || !changePlanId) {
      setPlan(null);
      setError(null);
      setNote("");
      setActionError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void getChangePlan(changePlanId)
      .then((result) => {
        if (!cancelled) setPlan(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar change plan");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, changePlanId]);

  const runAction = async (action: ReviewAction) => {
    if (!changePlanId) return;
    if (reviewActionRequiresNote(action) && !note.trim()) {
      setActionError("Nota obrigatória para esta ação.");
      return;
    }
    setActionBusy(action);
    setActionError(null);
    try {
      const updated = await applyReviewAction(changePlanId, action, note.trim() || undefined);
      setPlan(updated);
      setNote("");
      onUpdated?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Falha na ação de revisão");
    } finally {
      setActionBusy(null);
    }
  };

  const logicalDiffLines = plan?.logicalDiff ?? (Array.isArray(plan?.metadata?.logicalDiff) ? plan.metadata.logicalDiff as string[] : []);
  const ticketMarkdown = plan?.ticketMarkdown ?? (typeof plan?.metadata?.ticketMarkdown === "string" ? plan.metadata.ticketMarkdown : null);
  const proposedCommands = (plan?.snapshot?.proposedCommands as ProposedCommandSet[] | undefined)
    ?? (Array.isArray(plan?.metadata?.["proposedCommands"]) ? plan.metadata["proposedCommands"] as ProposedCommandSet[] : []);
  const proposedCommandWarnings = plan?.snapshot?.proposedCommandsWarnings
    ?? (Array.isArray(plan?.metadata?.["proposedCommandsWarnings"]) ? plan.metadata["proposedCommandsWarnings"] as string[] : []);
  const showProposedCommandsSection = (plan?.module === "bgp_announcements" || proposedCommands.length > 0 || proposedCommandWarnings.length > 0);

  async function handleCopyProposedCommands() {
    const confirmed = window.confirm("Entendo que estes comandos não foram executados e exigem revisão humana.");
    if (!confirmed) return;
    try {
      await navigator.clipboard.writeText(formatProposedCommandsClipboardText({
        proposedCommands,
        warnings: proposedCommandWarnings,
      }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Falha ao copiar comandos");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-0">
        <DialogHeader className="border-b border-slate-800 px-6 py-4">
          <DialogTitle className="text-[15px] font-semibold text-slate-100">Detalhes do Change Plan</DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Histórico auditável — nenhum comando será executado pelo sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTitle>Falha ao carregar change plan</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : plan ? (
            <>
              {workflowStatus === "approved_for_manual_implementation" ? (
                <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-100">
                  <AlertTitle>Aprovado apenas para implementação manual</AlertTitle>
                  <AlertDescription>
                    Nenhum comando será executado pelo sistema. Implemente as alterações manualmente conforme o ticket.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Info label="ID" value={`#${plan.id}`} />
                <Info label="Device" value={`${plan.hostname ?? "—"} (#${plan.deviceId})`} mono />
                <Info label="Peer" value={plan.peerIp ?? plan.snapshot?.peerIp ?? "—"} mono />
                <Info label="Workflow" value={WORKFLOW_STATUS_LABELS[workflowStatus]} />
                <Info label="Recomendação" value={plan.recommendation ?? plan.snapshot?.impact?.recommendation ?? "—"} />
                <Info label="Risco" value={plan.riskLevel ?? plan.snapshot?.impact?.riskLevel ?? "—"} />
                <Info label="Criado em" value={new Date(plan.createdAt).toLocaleString()} />
                <Info label="Módulo" value={plan.module} />
                {plan.reviewedBy ? <Info label="Revisado por" value={plan.reviewedBy} /> : null}
                {plan.reviewedAt ? <Info label="Revisado em" value={new Date(plan.reviewedAt).toLocaleString()} /> : null}
                {plan.sourceObjectType ? (
                  <Info
                    label="Origem preview"
                    value={`${plan.sourceObjectType}${plan.sourceObjectId ? ` #${plan.sourceObjectId}` : ""}`}
                    mono
                  />
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={cn("text-[10px]", workflowStatusTone(workflowStatus))}>
                  {WORKFLOW_STATUS_LABELS[workflowStatus]}
                </Badge>
                <Badge variant="outline" className="text-[10px]">DB: {plan.status}</Badge>
              </div>

              {plan.status === "invalid" ? (
                <Alert className="border-red-500/30 bg-red-500/10 text-red-100">
                  <AlertTitle>Plano inválido</AlertTitle>
                  <AlertDescription>Rollback documental indisponível — export bloqueado.</AlertDescription>
                </Alert>
              ) : null}

              {ticketMarkdown ? (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Ticket Markdown</h3>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-slate-800 bg-[#0f111a] p-3 text-xs text-emerald-100">
                    {ticketMarkdown}
                  </pre>
                </section>
              ) : null}

              {showProposedCommandsSection ? (
                <section className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Comandos Propostos / Não Executados</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase">Documental only</Badge>
                      {proposedCommands[0] ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Confidence: {proposedCommandConfidenceLabel(proposedCommands[0].confidence)}
                        </Badge>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleCopyProposedCommands()}
                        disabled={proposedCommands.length === 0}
                      >
                        Copiar comandos
                      </Button>
                    </div>
                  </div>
                  {proposedCommandWarnings.length > 0 ? (
                    <ul className="list-inside list-disc rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                      {proposedCommandWarnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                  {proposedCommands.length > 0 ? (
                    <div className="space-y-3">
                      {proposedCommands.map((set, index) => (
                        <div key={`${set.commandSetName}:${index}`} className="rounded-md border border-slate-800 bg-[#0f111a] p-3 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{set.vendor}</Badge>
                            <Badge variant="outline" className="text-[10px]">{set.scope}</Badge>
                            <Badge variant="outline" className="text-[10px]">{set.safety}</Badge>
                            <Badge variant="secondary" className="text-[10px]">
                              Confidence: {proposedCommandConfidenceLabel(set.confidence)}
                            </Badge>
                            <span className="text-slate-400">{set.commandSetName}</span>
                          </div>
                          <div className="mt-2 space-y-2">
                            {set.commands.map((command) => (
                              <pre key={command.line} className="whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-950/60 p-2 font-mono text-[11px] text-slate-200">
                                {command.line}
                              </pre>
                            ))}
                          </div>
                          {set.warnings.length > 0 ? (
                            <ul className="mt-2 list-inside list-disc text-xs text-amber-200">
                              {set.warnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
                      (nenhum comando proposto)
                    </div>
                  )}
                </section>
              ) : null}

              {logicalDiffLines.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Diff lógico</h3>
                  <ul className="rounded-md border border-slate-800 bg-[#0f111a] p-3 text-xs font-mono text-slate-300 space-y-1">
                    {logicalDiffLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {plan.reviewHistory && plan.reviewHistory.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Histórico de revisão</h3>
                  <div className="space-y-2">
                    {plan.reviewHistory.map((event) => (
                      <div key={event.id} className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2 text-slate-300">
                          <span>{new Date(event.createdAt).toLocaleString()}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {WORKFLOW_STATUS_LABELS[event.previousStatus]} → {WORKFLOW_STATUS_LABELS[event.nextStatus]}
                          </Badge>
                          {event.actor ? <span className="text-slate-400">por {event.actor}</span> : null}
                        </div>
                        {event.note ? <p className="mt-1 text-slate-400">{event.note}</p> : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {SECTIONS.map((section) => {
                const items = plan.items.filter(section.filter);
                if (!items.length) return null;
                return (
                  <section key={section.title} className="space-y-3">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{section.title}</h3>
                      {section.subtitle ? <p className="mt-1 text-[11px] text-slate-500">{section.subtitle}</p> : null}
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => <ItemCard key={`${item.itemType}:${item.itemName}`} item={item} />)}
                    </div>
                  </section>
                );
              })}

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Diff estrutural</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <DiffBucket title="REMOVED" items={plan.diff.removed} tone="red" />
                  <DiffBucket title="ADDED" items={plan.diff.added} tone="emerald" />
                  <DiffBucket title="CHANGED" items={plan.diff.changed} tone="amber" />
                  <DiffBucket title="UNCHANGED" items={plan.diff.unchanged.slice(0, 8)} tone="slate" />
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Rollback documental</h3>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-slate-800 bg-[#0f111a] p-3 text-xs text-slate-200">
                  {plan.rollback.script.join("\n") || "—"}
                </pre>
              </section>
            </>
          ) : null}
        </div>

        {plan && actions.length > 0 ? (
          <DialogFooter className="border-t border-slate-800 px-6 py-4 flex-col items-stretch gap-3 sm:flex-col">
            {actionError ? (
              <div className="text-xs text-red-300">{actionError}</div>
            ) : null}
            {(actions.includes("reject") || actions.includes("request-changes")) ? (
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota de revisão (obrigatória para rejeitar ou solicitar ajustes)"
                className="min-h-[72px] text-xs bg-slate-900 border-slate-700"
              />
            ) : null}
            <div className="flex flex-wrap gap-2 justify-end">
              {actions.map((action) => (
                <Button
                  key={action}
                  size="sm"
                  variant={action === "reject" ? "destructive" : action === "approve-manual" ? "default" : "outline"}
                  disabled={actionBusy !== null}
                  onClick={() => void runAction(action)}
                >
                  {actionBusy === action ? "Processando..." : REVIEW_ACTION_LABELS[action]}
                </Button>
              ))}
            </div>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("mt-1 text-sm text-slate-200", mono && "font-mono text-xs")}>{value}</div>
    </div>
  );
}

function DiffBucket({
  title,
  items,
  tone,
}: {
  title: string;
  items: ChangePlanDetail["diff"]["removed"];
  tone: "red" | "emerald" | "amber" | "slate";
}) {
  const border = tone === "red"
    ? "border-red-500/20"
    : tone === "emerald"
      ? "border-emerald-500/20"
      : tone === "amber"
        ? "border-amber-500/20"
        : "border-slate-700";
  return (
    <div className={cn("rounded-lg border p-3", border)}>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{title} ({items.length})</div>
      <ul className="mt-2 space-y-1 text-xs font-mono text-slate-300">
        {items.length ? items.map((item) => <li key={item.key}>{item.type} {item.name}</li>) : <li className="text-slate-500">—</li>}
      </ul>
    </div>
  );
}

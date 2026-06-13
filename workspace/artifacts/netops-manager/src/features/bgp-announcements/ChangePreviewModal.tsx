import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Link } from "wouter";
import { Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  AnnouncementChangePreview,
  BgpPreviewChangePlanLinkSummary,
  ChangePreviewActionType,
  ChangePreviewLogicalDiffItem,
  MatrixRow,
} from "./announcement-types";

const ACTION_OPTIONS: Array<{ value: ChangePreviewActionType; label: string }> = [
  { value: "set_community", label: "Definir community (estado)" },
  { value: "add_community", label: "Adicionar community" },
  { value: "remove_community", label: "Remover community" },
  { value: "block_announcement", label: "Bloquear anúncio" },
  { value: "allow_announcement", label: "Permitir anúncio" },
  { value: "set_prepend", label: "Definir prepend (preview lógico)" },
  { value: "clear_prepend", label: "Limpar prepend (preview lógico)" },
];

function formatLogicalDiffLine(item: ChangePreviewLogicalDiffItem): string {
  if (typeof item === "string") return item;
  return `${item.explanation} [${item.before.prepend} → ${item.after.prepend}]`;
}

const CELL_STATES = [
  { value: "on", label: "On" },
  { value: "p1", label: "P1" },
  { value: "p2", label: "P2" },
  { value: "p3", label: "P3" },
  { value: "p4", label: "P4" },
  { value: "off", label: "Off" },
  { value: "bh", label: "BH" },
  { value: "no_export", label: "NE" },
  { value: "none", label: "— (sem marcação)" },
];

interface ChangePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: MatrixRow | null;
  deviceId: number;
  snapshotId: number | null;
  upstreams: Array<{ circuitId: string; displayName: string }>;
  defaultCircuitId?: string | null;
  onGenerate: (payload: {
    actionType: ChangePreviewActionType;
    upstreamCircuitId?: string;
    newState?: string;
    community?: string;
    prependCount?: number;
  }) => Promise<AnnouncementChangePreview>;
  planEnabled?: boolean;
  onCreatePlan?: (previewId: number, options: { acknowledgeHighRisk: boolean }) => Promise<BgpPreviewChangePlanLinkSummary>;
  existingPlan?: BgpPreviewChangePlanLinkSummary | null;
}

export function ChangePreviewModal({
  open,
  onOpenChange,
  row,
  deviceId,
  snapshotId,
  upstreams,
  defaultCircuitId,
  onGenerate,
  planEnabled = false,
  onCreatePlan,
  existingPlan = null,
}: ChangePreviewModalProps) {
  const [actionType, setActionType] = useState<ChangePreviewActionType>("set_community");
  const [upstreamCircuitId, setUpstreamCircuitId] = useState(defaultCircuitId ?? upstreams[0]?.circuitId ?? "01");
  const [newState, setNewState] = useState("p2");
  const [community, setCommunity] = useState("");
  const [prependCount, setPrependCount] = useState("3");
  const [preview, setPreview] = useState<AnnouncementChangePreview | null>(null);
  const [planLink, setPlanLink] = useState<BgpPreviewChangePlanLinkSummary | null>(existingPlan);
  const [highRiskAck, setHighRiskAck] = useState(false);
  const [loading, setLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!row) return null;

  const needsUpstream = [
    "set_community",
    "block_announcement",
    "allow_announcement",
    "set_prepend",
    "clear_prepend",
  ].includes(actionType);
  const needsCommunity = actionType === "add_community" || actionType === "remove_community";
  const needsNewState = actionType === "set_community";
  const needsPrependCount = actionType === "set_prepend";
  const isPrependAction = actionType === "set_prepend" || actionType === "clear_prepend";
  const canCreatePlan = Boolean(
    planEnabled
    && onCreatePlan
    && preview?.id
    && !preview.riskAssessment.blocked
    && preview.targetEditMode === "editable_future"
    && !planLink,
  );
  const requiresHighRiskAck = preview?.riskAssessment.level === "high";

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setPlanLink(null);
    try {
      if (needsPrependCount) {
        const parsed = Number(prependCount);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
          throw new Error("prependCount deve ser inteiro entre 1 e 10.");
        }
      }
      const result = await onGenerate({
        actionType,
        upstreamCircuitId: needsUpstream ? upstreamCircuitId : undefined,
        newState: needsNewState ? newState : undefined,
        community: needsCommunity ? community : undefined,
        prependCount: needsPrependCount ? Number(prependCount) : undefined,
      });
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar preview");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadMarkdown() {
    if (!preview?.ticketMarkdown) return;
    const blob = new Blob([preview.ticketMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bgp-change-preview-${preview.id ?? deviceId}-${preview.targetId}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleCreatePlan() {
    if (!preview?.id || !onCreatePlan) return;
    if (requiresHighRiskAck && !highRiskAck) {
      setError("Confirme que está ciente de que este plano exige revisão manual.");
      return;
    }
    setPlanLoading(true);
    setError(null);
    try {
      const link = await onCreatePlan(preview.id, { acknowledgeHighRisk: highRiskAck });
      setPlanLink(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar plano");
    } finally {
      setPlanLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-card text-foreground">
        <DialogHeader>
          <DialogTitle>Preview de alteração — {row.routePolicyName}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 text-[12px]">
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <div className="grid gap-1 sm:grid-cols-2">
              <div><span className="text-muted-foreground">Target:</span> {row.routePolicyName} #{row.node}</div>
              <div><span className="text-muted-foreground">Role:</span> {row.targetRole ?? row.targetType}</div>
              <div><span className="text-muted-foreground">Device:</span> {deviceId}</div>
              <div><span className="text-muted-foreground">Snapshot:</span> {snapshotId ?? "—"}</div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Read-only — nenhum comando será executado no equipamento.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Tipo de ação</Label>
              <Select value={actionType} onValueChange={(value) => setActionType(value as ChangePreviewActionType)}>
                <SelectTrigger className="h-8 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {needsUpstream ? (
              <div className="space-y-1">
                <Label className="text-[11px]">Upstream (marcação import)</Label>
                <Select value={upstreamCircuitId} onValueChange={setUpstreamCircuitId}>
                  <SelectTrigger className="h-8 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {upstreams.map((upstream) => (
                      <SelectItem key={upstream.circuitId} value={upstream.circuitId}>
                        {upstream.displayName} (C{upstream.circuitId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {needsNewState ? (
              <div className="space-y-1">
                <Label className="text-[11px]">Novo estado</Label>
                <Select value={newState} onValueChange={setNewState}>
                  <SelectTrigger className="h-8 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CELL_STATES.map((state) => (
                      <SelectItem key={state.value} value={state.value}>{state.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {needsCommunity ? (
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-[11px]">Community</Label>
                <Input
                  className="h-8 font-mono text-[12px]"
                  placeholder="64777:51003"
                  value={community}
                  onChange={(event) => setCommunity(event.target.value)}
                />
              </div>
            ) : null}

            {needsPrependCount ? (
              <div className="space-y-1">
                <Label className="text-[11px]">Prepend count (1–10)</Label>
                <Input
                  className="h-8 font-mono text-[12px]"
                  type="number"
                  min={1}
                  max={10}
                  value={prependCount}
                  onChange={(event) => setPrependCount(event.target.value)}
                />
              </div>
            ) : null}
          </div>

          {isPrependAction ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-100">
              Preview lógico/documental de prepend — nenhum comando vendor real será gerado ou executado.
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-red-200">{error}</div>
          ) : null}

          {preview ? (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={preview.riskAssessment.blocked ? "destructive" : "outline"}>
                  Risco: {preview.riskAssessment.level}
                </Badge>
                <Badge variant="secondary">{preview.validation.status}</Badge>
                {preview.id ? <Badge variant="outline">Preview #{preview.id}</Badge> : null}
                {planLink ? (
                  <Badge variant="secondary">
                    Plano #{planLink.changePlanId} ({planLink.workflowStatus})
                  </Badge>
                ) : null}
              </div>

              {requiresHighRiskAck && canCreatePlan ? (
                <label className="flex items-start gap-2 text-[11px] text-amber-200/90">
                  <Checkbox checked={highRiskAck} onCheckedChange={(value) => setHighRiskAck(value === true)} />
                  <span>Estou ciente que este plano exige revisão manual.</span>
                </label>
              ) : null}

              {planLink ? (
                <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3 text-[11px]">
                  <div className="font-medium text-foreground">
                    Plano de mudança #{planLink.changePlanId}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    Status: {planLink.workflowStatus} — sem execução automática.
                  </div>
                  {planLink.workflowStatus === "approved_for_manual_implementation" ? (
                    <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-200">
                      Aprovado apenas para implementação manual. Nenhum comando será executado pelo sistema.
                    </div>
                  ) : null}
                  <Link
                    href={`/change-plans?highlight=${planLink.changePlanId}`}
                    className="mt-2 inline-block text-sky-300 underline"
                  >
                    Ver plano
                  </Link>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 font-medium text-foreground">Estado atual</div>
                  <pre className="max-h-32 overflow-auto rounded bg-black/30 p-2 font-mono text-[10px]">
                    {JSON.stringify(preview.currentState, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="mb-1 font-medium text-foreground">Estado proposto</div>
                  <pre className="max-h-32 overflow-auto rounded bg-black/30 p-2 font-mono text-[10px]">
                    {JSON.stringify(preview.proposedState, null, 2)}
                  </pre>
                </div>
              </div>

              <div>
                <div className="mb-1 font-medium text-foreground">Diff lógico</div>
                <ul className="list-inside list-disc space-y-0.5 font-mono text-[10px] text-muted-foreground">
                  {preview.logicalDiff.map((line, index) => (
                    <li key={`${index}:${formatLogicalDiffLine(line)}`}>{formatLogicalDiffLine(line)}</li>
                  ))}
                </ul>
              </div>

              {preview.riskHints && preview.riskHints.length > 0 ? (
                <div>
                  <div className="mb-1 font-medium text-foreground">Risk hints</div>
                  <ul className="list-inside list-disc text-[11px] text-sky-200/90">
                    {preview.riskHints.map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview.riskAssessment.reasons.length > 0 ? (
                <div>
                  <div className="mb-1 font-medium text-foreground">Riscos</div>
                  <ul className="list-inside list-disc text-[11px] text-amber-200/90">
                    {preview.riskAssessment.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <div className="mb-1 font-medium text-foreground">Ticket Markdown</div>
                <pre className="max-h-48 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] text-emerald-100 whitespace-pre-wrap">
                  {preview.ticketMarkdown}
                </pre>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
          {preview?.ticketMarkdown ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void navigator.clipboard.writeText(preview.ticketMarkdown)}
              >
                Copiar markdown
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadMarkdown}>
                <Download className="mr-2 h-3.5 w-3.5" />
                Baixar markdown
              </Button>
            </>
          ) : null}
          <Button size="sm" disabled={loading} onClick={() => void handleGenerate()}>
            {loading ? "Gerando…" : "Gerar preview de alteração"}
          </Button>
          {canCreatePlan ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={planLoading || (requiresHighRiskAck && !highRiskAck)}
              onClick={() => void handleCreatePlan()}
            >
              {planLoading ? "Criando plano…" : "Criar plano de mudança"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

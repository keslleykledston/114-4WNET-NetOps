import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type MatrixRow = {
  targetPolicyName?: string;
  routePolicyName: string;
  targetType: string;
  family: string;
  prefixScope: {
    type: "network" | "ip_prefix" | "ipv6_prefix" | "unknown";
    name: string;
    expandedPrefixes: Array<{ index: number | null; action: string | null; prefix: string; ge?: number | null; le?: number | null; raw: string }>;
    affectedPrefixCount: number;
    shared: boolean | null;
  };
  affectedPrefixes: string[];
  node?: number | null;
  findings?: Array<{ code: string; severity: "info" | "warning" | "error"; scope: string; message: string }>;
};

type MatrixCell = {
  circuitId: string;
  upstreamName: string;
  state: string;
  label?: string;
  community?: string | null;
  actionCode?: string | null;
  communitySourceType?: "direct" | "community_list" | "unknown";
  communitySourceName?: string | null;
  communities?: string[];
  note?: string | null;
};

type PreviewResponse = {
  previewId: string;
  baseSnapshotId: number;
  deviceId: number;
  collectionId: number | null;
  targetPolicyName: string;
  targetType: string;
  node: number;
  upstreamCircuitId: string;
  upstreamName: string;
  prefixScope: MatrixRow["prefixScope"];
  currentState: string;
  desiredState: string;
  currentCommunity: string | null;
  desiredCommunity: string | null;
  currentCommunitySourceType: "direct" | "community_list" | "unknown";
  currentCommunitySourceName: string | null;
  currentCommunities: string[];
  desiredCommunities: string[];
  communitySetMatch: {
    matched: boolean;
    matchType: "exact" | "none";
    communityListName?: string | null;
    normalizedHash?: string | null;
    communities: string[];
    desiredCommunities?: string[];
    nearestMatches?: Array<{ name: string; normalizedHash: string; overlap: number }>;
  };
  diff: {
    removedCommunities: string[];
    addedCommunities: string[];
    preservedCommunities: string[];
    oldState: string;
    newState: string;
  };
  proposedCommands: Array<{ command: string; confidence: "high" | "medium" | "low"; note?: string | null }>;
  rollbackCommands: Array<{ command: string; confidence: "high" | "medium" | "low"; note?: string | null }>;
  rollbackDiff: {
    removedCommunities: string[];
    addedCommunities: string[];
    preservedCommunities: string[];
    oldState: string;
    newState: string;
  };
  rollbackSource: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  findings: Array<{ code: string; severity: "info" | "warning" | "error"; scope: string; message: string; communityList?: string | null }>;
  status: "preview_only";
  commandConfidence: "high" | "medium" | "low";
  note: string | null;
};

const desiredStates = ["On", "P1", "P2", "P3", "P4", "Off", "NE", "BH", "Def", "Clear"] as const;

function defaultDesiredState(cell: MatrixCell | null): string {
  if (!cell) return "Clear";
  if (cell.label === "On" || cell.label === "P1" || cell.label === "P2" || cell.label === "P3" || cell.label === "P4" || cell.label === "Off" || cell.label === "NE" || cell.label === "BH" || cell.label === "Def") {
    return cell.label;
  }
  return "Clear";
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export interface BgpAnnouncementPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceId: number | null;
  snapshotId: number | null;
  row: MatrixRow | null;
  cell: MatrixCell | null;
  onSaved?: () => void;
}

export function BgpAnnouncementPreviewModal({ open, onOpenChange, deviceId, snapshotId, row, cell, onSaved }: BgpAnnouncementPreviewModalProps) {
  const [desiredState, setDesiredState] = useState<string>("Clear");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDesiredState(defaultDesiredState(cell));
    setNote("");
    setPreview(null);
    setError(null);
  }, [cell, open]);

  const previewMutation = useMutation({
    mutationFn: () => {
      if (!deviceId || !snapshotId || !row || !cell || row.node == null) {
        throw new Error("Seleção incompleta");
      }
      return apiFetch<PreviewResponse>("/api/bgp/announcements/preview-change", {
        method: "POST",
        body: JSON.stringify({
          baseSnapshotId: snapshotId,
          deviceId,
          targetPolicyName: row.targetPolicyName ?? row.routePolicyName,
          node: row.node,
          upstreamCircuitId: cell.circuitId,
          desiredState,
          note: note.trim() || null,
        }),
      });
    },
    onSuccess: (result) => {
      setPreview(result);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Falha ao gerar preview");
    },
  });

  const draftMutation = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("Gere um preview antes de salvar");
      return apiFetch("/api/bgp/announcements/change-plans", {
        method: "POST",
        body: JSON.stringify({ previewId: preview.previewId, note: note.trim() || null }),
      });
    },
    onSuccess: () => {
      onSaved?.();
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Falha ao salvar draft");
    },
  });

  const findings = preview?.findings ?? [];
  const commands = useMemo(() => preview?.proposedCommands ?? [], [preview]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Preview read-only</DialogTitle>
          <DialogDescription>
            Célula da matriz. Preview só simula diff e draft. Nada é aplicado.
          </DialogDescription>
        </DialogHeader>

        {!row || !cell ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            Selecione uma célula da matriz.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Target policy</Label>
                  <Input readOnly value={row.targetPolicyName ?? row.routePolicyName} />
                </div>
                <div className="space-y-1">
                  <Label>Target type</Label>
                  <Input readOnly value={row.targetType} />
                </div>
                <div className="space-y-1">
                  <Label>Node</Label>
                  <Input readOnly value={row.node ?? "—"} />
                </div>
                <div className="space-y-1">
                  <Label>Upstream</Label>
                  <Input readOnly value={`${cell.upstreamName} / ${cell.circuitId}`} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Prefix scope</Label>
                  <Input readOnly value={`${row.prefixScope.type} · ${row.prefixScope.name} · ${row.prefixScope.affectedPrefixCount} prefixos`} />
                </div>
                <div className="space-y-1">
                  <Label>Estado atual</Label>
                  <Input readOnly value={`${cell.label ?? cell.state} · ${cell.community ?? "—"}`} />
                </div>
                <div className="space-y-1">
                  <Label>Origem atual</Label>
                  <Input readOnly value={`${cell.communitySourceType ?? "unknown"}${cell.communitySourceName ? ` / ${cell.communitySourceName}` : ""}`} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="space-y-1">
                  <Label>Estado desejado</Label>
                  <Select value={desiredState} onValueChange={setDesiredState}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {desiredStates.map((state) => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Nota</Label>
                  <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Opcional" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void previewMutation.mutateAsync()} disabled={previewMutation.isPending || !deviceId || !snapshotId || !row || !cell || row.node == null}>
                  {previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Gerar preview
                </Button>
                <Button variant="secondary" onClick={() => void draftMutation.mutateAsync()} disabled={!preview || draftMutation.isPending}>
                  {draftMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Salvar change-plan draft
                </Button>
                <Badge variant="outline">Read-only</Badge>
                <Badge variant="outline">Snapshot #{snapshotId ?? "n/a"}</Badge>
              </div>

              {error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              {preview ? (
                <div className="space-y-4 rounded-xl border border-border bg-background/40 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">risk {preview.riskLevel}</Badge>
                    <Badge variant="secondary">community set {preview.communitySetMatch.matched ? "exact" : "none"}</Badge>
                    <Badge variant="secondary">command {preview.commandConfidence}</Badge>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase text-muted-foreground">Diff</div>
                      <pre className="mt-2 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-5">
{JSON.stringify(preview.diff, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-muted-foreground">Rollback</div>
                      <pre className="mt-2 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-5">
{JSON.stringify(preview.rollbackDiff, null, 2)}
                      </pre>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase text-muted-foreground">Commands propostos</div>
                      <pre className="mt-2 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-5">
{commands.map((command) => `# ${command.confidence}${command.note ? ` · ${command.note}` : ""}\n${command.command}`).join("\n")}
                      </pre>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-muted-foreground">Rollback</div>
                      <pre className="mt-2 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-5">
{(preview.rollbackCommands ?? []).map((command) => `# ${command.confidence}${command.note ? ` · ${command.note}` : ""}\n${command.command}`).join("\n")}
                      </pre>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs uppercase text-muted-foreground">Findings</div>
                    <div className="space-y-2">
                      {findings.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Nenhum finding.</div>
                      ) : findings.map((finding) => (
                        <div key={`${finding.code}-${finding.message}`} className="rounded-lg border border-border bg-background/50 px-3 py-2 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{finding.severity}</Badge>
                            <Badge variant="outline">{finding.scope}</Badge>
                            <span className="font-mono text-xs">{finding.code}</span>
                          </div>
                          <div className="mt-1 text-muted-foreground">{finding.message}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-background/40 p-4">
                <div className="text-xs uppercase text-muted-foreground">Estado atual</div>
                <div className="mt-2 space-y-1 text-sm">
                  <div><span className="text-muted-foreground">Cell:</span> {cell.label ?? cell.state}</div>
                  <div><span className="text-muted-foreground">Community:</span> {cell.community ?? "—"}</div>
                  <div><span className="text-muted-foreground">Source:</span> {cell.communitySourceType ?? "unknown"}{cell.communitySourceName ? ` / ${cell.communitySourceName}` : ""}</div>
                  <div><span className="text-muted-foreground">Célula:</span> {cell.circuitId}</div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background/40 p-4">
                <div className="text-xs uppercase text-muted-foreground">Prefixos afetados</div>
                <div className="mt-2 space-y-2">
                  {row.prefixScope.expandedPrefixes.length === 0 ? (
                    <div className="text-sm text-muted-foreground">—</div>
                  ) : row.prefixScope.expandedPrefixes.map((item) => (
                    <div key={item.raw} className="rounded border border-border bg-background/50 px-3 py-2">
                      <div className="font-mono text-xs">{item.prefix}</div>
                      <div className="text-[11px] text-muted-foreground">{item.raw}</div>
                    </div>
                  ))}
                </div>
              </div>

              {preview?.communitySetMatch.matched ? (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                  Match exato: {preview.communitySetMatch.communityListName}
                </div>
              ) : null}
            </div>
          </div>
        )}

        <Separator />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

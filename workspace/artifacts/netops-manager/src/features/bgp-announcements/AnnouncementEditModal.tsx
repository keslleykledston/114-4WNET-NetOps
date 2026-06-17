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
import { useState } from "react";
import type { MatrixRow, PreviewChangeResponse } from "./announcement-types";

const NEW_STATES = [
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

interface AnnouncementEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: MatrixRow | null;
  circuitId: string | null;
  upstreamName: string | null;
  onPreview: (newState: string) => Promise<PreviewChangeResponse>;
  onSavePlan?: (preview: PreviewChangeResponse, newState: string) => Promise<void>;
}

export function AnnouncementEditModal({
  open,
  onOpenChange,
  row,
  circuitId,
  upstreamName,
  onPreview,
  onSavePlan,
}: AnnouncementEditModalProps) {
  const [newState, setNewState] = useState("p2");
  const [preview, setPreview] = useState<PreviewChangeResponse | null>(null);
  const [loading, setLoading] = useState(false);

  if (!row || !circuitId) return null;

  const currentCell = row.cells.find((c) => c.circuitId === circuitId);

  async function handlePreview() {
    setLoading(true);
    try {
      const result = await onPreview(newState);
      setPreview(result);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card text-foreground">
        <DialogHeader>
          <DialogTitle>Simular alteração — {upstreamName}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 text-[12px]">
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/20 p-3">
            <div><span className="text-muted-foreground">Target:</span> {row.routePolicyName}</div>
            <div><span className="text-muted-foreground">Node:</span> {row.node}</div>
            <div><span className="text-muted-foreground">Circuit:</span> {circuitId}</div>
            <div><span className="text-muted-foreground">Atual:</span> {currentCell?.label ?? "—"}</div>
          </div>

          <div>
            <Label className="text-[11px]">Prefixos afetados ({row.affectedPrefixes.length})</Label>
            <div className="mt-1 max-h-24 overflow-auto font-mono text-[10px] text-muted-foreground">
              {row.affectedPrefixes.join(", ") || row.prefixScope}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Novo estado</Label>
            <Select value={newState} onValueChange={setNewState}>
              <SelectTrigger className="h-8 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NEW_STATES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {preview ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="text-[11px]">
                <span className="text-muted-foreground">Risco:</span>{" "}
                <span className="capitalize text-amber-200">{preview.riskLevel}</span>
                {!preview.allowed ? (
                  <span className="ml-2 text-red-300">Bloqueado: {preview.blockedReasons.join(", ")}</span>
                ) : null}
              </div>
              {preview.communitySetMatchName ? (
                <div className="text-[11px] text-emerald-300">
                  Match community-list: {preview.communitySetMatchName}
                </div>
              ) : (
                <div className="text-[11px] text-amber-200">Sem match exato — communities diretas</div>
              )}
              <pre className="max-h-40 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] text-emerald-100">
                {preview.generatedScript}
              </pre>
              {preview.diff.length > 0 ? (
                <div className="space-y-0.5 font-mono text-[10px] text-muted-foreground">
                  {preview.diff.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
          {preview?.generatedScript ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(preview.generatedScript)}
            >
              Copiar script
            </Button>
          ) : null}
          <Button size="sm" disabled={loading} onClick={() => void handlePreview()}>
            {loading ? "Gerando…" : "Gerar Preview"}
          </Button>
          {preview && preview.allowed && onSavePlan ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={() => void onSavePlan(preview, newState)}
            >
              Criar plano (draft)
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { SnapshotDiffFilter, SnapshotDiffResponse, SnapshotSummary } from "./announcement-types";
import { SnapshotDiffPanel } from "./SnapshotDiffPanel";

interface SnapshotHistoryPanelProps {
  snapshots: SnapshotSummary[];
  activeSnapshotId: number | null;
  onOpenSnapshot: (snapshotId: number) => void;
  loading?: boolean;
  diff?: SnapshotDiffResponse | null;
  diffLoading?: boolean;
  diffError?: string | null;
  diffFilter: SnapshotDiffFilter;
  onDiffFilterChange: (filter: SnapshotDiffFilter) => void;
  onCompare: (baseSnapshotId: number, compareSnapshotId: number) => void;
  onCloseDiff?: () => void;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

export function SnapshotHistoryPanel({
  snapshots,
  activeSnapshotId,
  onOpenSnapshot,
  loading = false,
  diff = null,
  diffLoading = false,
  diffError = null,
  diffFilter,
  onDiffFilterChange,
  onCompare,
  onCloseDiff,
}: SnapshotHistoryPanelProps) {
  const [baseId, setBaseId] = useState<number | null>(null);
  const [compareId, setCompareId] = useState<number | null>(null);

  if (loading) {
    return <div className="text-[12px] text-muted-foreground">Carregando histórico…</div>;
  }

  if (snapshots.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-[12px] text-muted-foreground">
        Nenhum snapshot salvo ainda. Use <strong className="text-foreground">Atualizar matriz</strong> para gerar o primeiro a partir dos dados persistidos.
      </div>
    );
  }

  const canCompare = baseId != null && compareId != null && baseId !== compareId;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-100">
        Snapshots são append-only. A comparação é read-only — não gera Change Preview nem Change Plan automaticamente.
      </div>

      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full text-left text-[12px]">
          <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-2">Base</th>
              <th className="px-2 py-2">Compare</th>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Data/hora</th>
              <th className="px-3 py-2">Targets</th>
              <th className="px-3 py-2">Communities</th>
              <th className="px-3 py-2">Conflitos</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {snapshots.map((snapshot) => (
              <tr
                key={snapshot.id}
                className={`border-t border-border/60 ${activeSnapshotId === snapshot.id ? "bg-primary/10" : ""}`}
              >
                <td className="px-2 py-2 text-center">
                  <Checkbox
                    checked={baseId === snapshot.id}
                    onCheckedChange={(checked) => setBaseId(checked ? snapshot.id : null)}
                    aria-label={`Base snapshot ${snapshot.id}`}
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <Checkbox
                    checked={compareId === snapshot.id}
                    onCheckedChange={(checked) => setCompareId(checked ? snapshot.id : null)}
                    aria-label={`Compare snapshot ${snapshot.id}`}
                  />
                </td>
                <td className="px-3 py-2 font-mono text-[11px]">#{snapshot.id}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{formatWhen(snapshot.createdAt)}</td>
                <td className="px-3 py-2">{snapshot.counters.rowCount}</td>
                <td className="px-3 py-2">{snapshot.counters.communitySetCount}</td>
                <td className="px-3 py-2">{snapshot.conflictCount}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="text-[10px] capitalize">{snapshot.status}</Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant={activeSnapshotId === snapshot.id ? "secondary" : "outline"}
                    className="h-7 text-[11px]"
                    onClick={() => onOpenSnapshot(snapshot.id)}
                  >
                    Abrir
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!canCompare || diffLoading}
          onClick={() => {
            if (baseId != null && compareId != null) {
              const older = baseId < compareId ? baseId : compareId;
              const newer = baseId < compareId ? compareId : baseId;
              onCompare(older, newer);
            }
          }}
        >
          Comparar snapshots
        </Button>
        {baseId != null && compareId != null ? (
          <span className="text-[11px] text-muted-foreground">
            Base #{Math.min(baseId, compareId)} → Compare #{Math.max(baseId, compareId)}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">Selecione dois snapshots (base = mais antigo na comparação).</span>
        )}
      </div>

      {(diff || diffLoading || diffError) ? (
        <SnapshotDiffPanel
          diff={diff}
          loading={diffLoading}
          error={diffError}
          filter={diffFilter}
          onFilterChange={onDiffFilterChange}
          onClose={onCloseDiff}
        />
      ) : null}
    </div>
  );
}

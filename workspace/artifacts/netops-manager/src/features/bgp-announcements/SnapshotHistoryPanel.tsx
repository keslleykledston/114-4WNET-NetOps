import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SnapshotSummary } from "./announcement-types";

interface SnapshotHistoryPanelProps {
  snapshots: SnapshotSummary[];
  activeSnapshotId: number | null;
  onOpenSnapshot: (snapshotId: number) => void;
  loading?: boolean;
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
}: SnapshotHistoryPanelProps) {
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

  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full text-left text-[12px]">
        <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
          <tr>
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
                  Abrir snapshot
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

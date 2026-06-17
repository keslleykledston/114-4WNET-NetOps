import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SnapshotDiffChange, SnapshotDiffFilter, SnapshotDiffResponse } from "./announcement-types";
import { cn } from "@/lib/utils";

const FILTER_OPTIONS: Array<{ value: SnapshotDiffFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "editable", label: "Clientes / ORIGIN" },
  { value: "audit", label: "Upstream auditoria" },
  { value: "protected_global", label: "Globais protegidos" },
  { value: "conflicts", label: "Conflitos" },
  { value: "metadata", label: "Metadados" },
];

function changeBadgeLabel(type: SnapshotDiffChange["type"]): string {
  if (type.includes("added") && type.startsWith("conflict")) return "Conflito novo";
  if (type === "conflict_resolved") return "Conflito resolvido";
  if (type.startsWith("protected_global")) return "Global protegido";
  if (type === "upstream_audit_changed") return "Auditoria upstream";
  if (type.includes("added")) return "Adicionado";
  if (type.includes("removed")) return "Removido";
  if (type.includes("changed") || type.includes("resolved")) return "Alterado";
  return type;
}

function severityClass(severity: SnapshotDiffChange["severity"]): string {
  switch (severity) {
    case "critical":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    case "warning":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  }
}

function matchesFilter(change: SnapshotDiffChange, filter: SnapshotDiffFilter): boolean {
  switch (filter) {
    case "editable":
      return change.isEditableTarget;
    case "audit":
      return change.isAuditOnly || change.type === "upstream_audit_changed";
    case "protected_global":
      return change.isProtectedGlobal || change.type.startsWith("protected_global_");
    case "conflicts":
      return change.type.startsWith("conflict_");
    case "metadata":
      return change.type === "metadata_changed";
    default:
      return true;
  }
}

interface SnapshotDiffPanelProps {
  diff: SnapshotDiffResponse | null;
  loading?: boolean;
  error?: string | null;
  filter: SnapshotDiffFilter;
  onFilterChange: (filter: SnapshotDiffFilter) => void;
  onClose?: () => void;
}

export function SnapshotDiffPanel({
  diff,
  loading = false,
  error = null,
  filter,
  onFilterChange,
  onClose,
}: SnapshotDiffPanelProps) {
  if (loading) {
    return <div className="text-[12px] text-muted-foreground">Calculando diff…</div>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-200">
        {error}
      </div>
    );
  }

  if (!diff) return null;

  const filtered = diff.changes.filter((change) => matchesFilter(change, filter));

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-foreground">Comparação read-only</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Snapshot #{diff.baseSnapshot.id} → #{diff.compareSnapshot.id} — não gera preview nem change plan.
          </div>
        </div>
        {onClose ? (
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onClose}>
            Fechar diff
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 text-[10px]">
        <Badge variant="outline">+{diff.summary.addedTargets} targets</Badge>
        <Badge variant="outline">−{diff.summary.removedTargets} removidos</Badge>
        <Badge variant="outline">~{diff.summary.changedTargets} alterados</Badge>
        <Badge variant="outline">+{diff.summary.addedCommunities} communities</Badge>
        <Badge variant="outline">{diff.summary.newConflicts} conflitos novos</Badge>
        <Badge variant="outline">{diff.summary.resolvedConflicts} resolvidos</Badge>
      </div>

      {diff.riskHints.length > 0 ? (
        <div className="space-y-1 rounded-md border border-sky-500/30 bg-sky-500/10 p-3 text-[11px] text-sky-100">
          {diff.riskHints.map((hint) => (
            <div key={hint}>{hint}</div>
          ))}
        </div>
      ) : null}

      <Select value={filter} onValueChange={(value) => onFilterChange(value as SnapshotDiffFilter)}>
        <SelectTrigger className="h-8 w-[220px] text-[11px]">
          <SelectValue placeholder="Filtrar mudanças" />
        </SelectTrigger>
        <SelectContent>
          {FILTER_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-[11px]">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-[12px] text-muted-foreground">
          Nenhuma mudança neste filtro.
        </div>
      ) : (
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {filtered.map((change, index) => (
            <ChangeRow key={`${change.type}:${change.targetId}:${index}`} change={change} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeRow({ change }: { change: SnapshotDiffChange }) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn("text-[10px]", severityClass(change.severity))}>
          {changeBadgeLabel(change.type)}
        </Badge>
        {change.targetName ? (
          <span className="font-mono text-foreground">{change.targetName}</span>
        ) : null}
        {change.targetRole ? (
          <Badge variant="secondary" className="text-[10px]">{change.targetRole}</Badge>
        ) : null}
      </div>
      <p className="mt-1 text-muted-foreground">{change.explanation}</p>
    </div>
  );
}

interface SnapshotDiffSummaryCardProps {
  diff: SnapshotDiffResponse;
  onOpenHistory?: () => void;
}

export function SnapshotDiffSummaryCard({ diff, onOpenHistory }: SnapshotDiffSummaryCardProps) {
  const totalChanges = diff.changes.length;
  if (totalChanges === 0) return null;

  return (
    <div className="rounded-md border border-violet-500/30 bg-violet-500/10 p-3 text-[11px]">
      <div className="font-medium text-foreground">Última mudança entre snapshots</div>
      <div className="mt-1 text-muted-foreground">
        #{diff.baseSnapshot.id} → #{diff.compareSnapshot.id}: {totalChanges} mudança(s) detectada(s).
      </div>
      {onOpenHistory ? (
        <Button size="sm" variant="link" className="mt-1 h-auto p-0 text-[11px]" onClick={onOpenHistory}>
          Ver no Histórico
        </Button>
      ) : null}
    </div>
  );
}

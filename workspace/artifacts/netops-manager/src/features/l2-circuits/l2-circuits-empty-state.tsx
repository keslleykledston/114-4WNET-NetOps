import { BookOpen, FilterX, SearchX } from "lucide-react";

const RUNBOOK_PATH = "docs/l2-circuits/RUNBOOK_L2_DISCOVERY.md";

interface L2CircuitsEmptyStateProps {
  variant: "no-data" | "no-match";
}

export function L2CircuitsEmptyState({ variant }: L2CircuitsEmptyStateProps) {
  if (variant === "no-data") {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <SearchX className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Nenhum circuito L2 descoberto ainda</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Esta tela e consulta read-only. Circuitos aparecem aqui depois de discovery controlado
          (SSH read-only, flag explicita, rollback obrigatorio).
        </p>
        <p className="mt-4 inline-flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5 shrink-0" />
          Runbook:
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
            {RUNBOOK_PATH}
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-dashed p-8 text-center">
      <FilterX className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">Nenhum circuito com filtros atuais</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Ajuste device, tipo, status ou campos VLAN / VC-ID / peer IP — ou limpe filtros.
      </p>
    </div>
  );
}

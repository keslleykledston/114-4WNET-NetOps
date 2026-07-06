import { BookOpen, FilterX, SearchX } from "lucide-react";
import { useTranslation } from "@/i18n";

const RUNBOOK_PATH = "docs/l2-circuits/RUNBOOK_L2_DISCOVERY.md";

interface L2CircuitsEmptyStateProps {
  variant: "no-data" | "no-match";
}

export function L2CircuitsEmptyState({ variant }: L2CircuitsEmptyStateProps) {
  const { t } = useTranslation();

  if (variant === "no-data") {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <SearchX className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">{t("l2Circuits.emptyNoDataTitle")}</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          {t("l2Circuits.emptyNoDataDescription")}
        </p>
        <p className="mt-4 inline-flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5 shrink-0" />
          {t("l2Circuits.emptyNoDataRunbook")}
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
      <p className="text-sm font-medium">{t("l2Circuits.emptyNoMatchTitle")}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("l2Circuits.emptyNoMatchDescription")}
      </p>
    </div>
  );
}

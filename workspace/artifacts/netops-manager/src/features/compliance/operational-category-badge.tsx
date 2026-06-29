import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n";
import type { TranslationParams } from "@/i18n/types";
import { cn } from "@/lib/utils";

type TranslateFn = (key: string, params?: TranslationParams) => string;

const CATEGORY_CLASS_NAMES: Record<string, string> = {
  BLOCKER_REAL: "bg-red-500/10 text-red-300 border-red-500/30",
  RISCO_OPERACIONAL: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  PADRONIZACAO: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  CUSTOMIZACAO: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  INFORMATIVO: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  FALSO_POSITIVO: "bg-green-500/10 text-green-300 border-green-500/30",
};

export function operationalCategoryLabel(t: TranslateFn, value: string | null | undefined) {
  if (!value) return t("compliance.operationalCategories.unclassified");
  const key = `compliance.operationalCategories.${value}`;
  const translated = t(key);
  return translated === key ? value : translated;
}

interface OperationalCategoryBadgeProps {
  value: string | null | undefined;
  className?: string;
}

export function OperationalCategoryBadge({ value, className }: OperationalCategoryBadgeProps) {
  const { t } = useTranslation();
  const key = value ?? "unknown";

  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap", CATEGORY_CLASS_NAMES[key] ?? "bg-slate-500/10 text-slate-300 border-slate-500/30", className)}
    >
      {operationalCategoryLabel(t, value)}
    </Badge>
  );
}

import { cn } from "@/lib/utils";
import type { CellStateLabel } from "./announcement-types";

const CELL_STYLES: Record<CellStateLabel, string> = {
  On: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  P1: "bg-yellow-500/20 text-yellow-200 border-yellow-500/40",
  P2: "bg-yellow-500/25 text-yellow-100 border-yellow-500/50",
  P3: "bg-orange-500/20 text-orange-200 border-orange-500/40",
  P4: "bg-red-500/20 text-red-200 border-red-500/40",
  Off: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
  BH: "bg-red-600/30 text-red-100 border-red-600/50",
  NE: "bg-purple-500/20 text-purple-200 border-purple-500/40",
  Def: "bg-sky-500/15 text-sky-200 border-sky-500/30",
  "—": "bg-muted/40 text-muted-foreground border-border",
  "?": "bg-violet-500/15 text-violet-200 border-violet-500/30",
  "!": "bg-red-600/40 text-red-50 border-red-500 animate-pulse",
};

interface AnnouncementCellProps {
  label: CellStateLabel;
  community?: string | null;
  onClick?: () => void;
  disabled?: boolean;
}

export function AnnouncementCell({ label, community, onClick, disabled }: AnnouncementCellProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={community ?? undefined}
      onClick={onClick}
      className={cn(
        "min-w-[2.25rem] rounded border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums transition-colors",
        CELL_STYLES[label] ?? CELL_STYLES["—"],
        onClick && !disabled ? "cursor-pointer hover:brightness-110" : "cursor-default",
        disabled && "opacity-50",
      )}
    >
      {label}
    </button>
  );
}

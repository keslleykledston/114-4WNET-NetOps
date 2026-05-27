import { Badge } from "@/components/ui/badge";

function fsmBadgeClass(fsmState: string): string {
  const value = fsmState.toLowerCase();
  if (value === "established") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  if (value === "idle") return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
  if (value === "active" || value === "connect" || value === "opensent" || value === "openconfirm") {
    return "bg-red-500/10 text-red-400 border-red-500/30";
  }
  return "bg-muted text-muted-foreground border-border";
}

function operBadgeClass(operStatus: string): string {
  const value = operStatus.toLowerCase();
  if (value === "up") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  if (value === "down") return "bg-red-500/10 text-red-400 border-red-500/30";
  return "bg-muted text-muted-foreground border-border";
}

export function BgpFsmStateBadge({ state }: { state: string }) {
  return (
    <Badge variant="outline" className={fsmBadgeClass(state)}>
      {state}
    </Badge>
  );
}

export function BgpOperStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={operBadgeClass(status)}>
      {status}
    </Badge>
  );
}

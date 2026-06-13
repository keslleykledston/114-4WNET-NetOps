import { Badge } from "@/components/ui/badge";
import type { DependencyProtection, DependencyScope, MatrixRow, TargetEditMode, TargetRole } from "./announcement-types";

function roleLabel(role: TargetRole | undefined): string {
  switch (role) {
    case "customer": return "Cliente";
    case "origin": return "ORIGIN";
    case "provider": return "Upstream auditoria";
    case "upstream": return "Upstream auditoria";
    case "ix": return "IX auditoria";
    case "cdn": return "CDN auditoria";
    case "ibgp": return "iBGP";
    default: return "Desconhecido";
  }
}

function editModeLabel(mode: TargetEditMode | undefined): string | null {
  switch (mode) {
    case "editable_future": return "Edição futura";
    case "audit_only": return "Somente auditoria";
    case "hidden": return "Oculto";
    default: return null;
  }
}

function protectionLabel(protection: DependencyProtection | undefined): string | null {
  switch (protection) {
    case "protected_global": return "Global protegido";
    case "protected_system": return "Sistema protegido";
    case "shared_requires_review": return "Compartilhado revisar";
    case "removable_candidate": return "Específico";
    default: return null;
  }
}

function scopeLabel(scope: DependencyScope | undefined): string | null {
  switch (scope) {
    case "global_shared": return "Global compartilhado";
    case "customer_specific": return "Cliente específico";
    case "circuit_specific": return "Circuito específico";
    case "system": return "Sistema";
    default: return null;
  }
}

export function SemanticBadges({ row }: { row: MatrixRow }) {
  const role = row.targetRole ?? (row.targetType === "origin" ? "origin" : row.targetType === "customer" ? "customer" : "unknown");
  const editMode = row.targetEditMode ?? (role === "origin" || role === "customer" ? "editable_future" : "unknown");

  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant="outline" className="text-[10px]">{roleLabel(role)}</Badge>
      {editModeLabel(editMode) ? (
        <Badge
          variant={editMode === "editable_future" ? "secondary" : "outline"}
          className="text-[10px]"
        >
          {editModeLabel(editMode)}
        </Badge>
      ) : null}
      {protectionLabel(row.dependencyProtection) ? (
        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-100">
          {protectionLabel(row.dependencyProtection)}
        </Badge>
      ) : null}
      {scopeLabel(row.dependencyScope) ? (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {scopeLabel(row.dependencyScope)}
        </Badge>
      ) : null}
    </div>
  );
}

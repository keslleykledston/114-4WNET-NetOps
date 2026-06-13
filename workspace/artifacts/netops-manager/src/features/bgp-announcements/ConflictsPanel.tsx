import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MatrixSemanticView } from "./announcement-types";

interface ConflictsPanelProps {
  semanticView: MatrixSemanticView | undefined;
}

export function ConflictsPanel({ semanticView }: ConflictsPanelProps) {
  const conflicts = semanticView?.realConflicts ?? [];
  const sharedWarnings = semanticView?.warnings.sharedDependency ?? [];

  if (conflicts.length === 0 && sharedWarnings.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-[12px] text-muted-foreground">
        Nenhum conflito real em targets editáveis (Cliente/ORIGIN). Objetos globais protegidos não geram falso positivo aqui.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {conflicts.map((conflict) => (
        <Card key={conflict.targetKey} className="border-red-500/30 bg-red-500/5">
          <CardHeader className="py-3">
            <CardTitle className="text-[13px] font-mono">
              {conflict.routePolicyName}
              <span className="ml-2 text-muted-foreground">#{conflict.node} · {conflict.family}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-3 text-[11px]">
            <Badge variant="destructive" className="text-[10px]">Conflito real</Badge>
            <div className="text-muted-foreground">{conflict.message}</div>
            <div className="font-mono text-[10px]">Circuitos: {conflict.circuitIds.join(", ")}</div>
          </CardContent>
        </Card>
      ))}
      {sharedWarnings.length > 0 ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-100">
          <div className="mb-1 font-medium text-amber-50">Dependências compartilhadas (revisar)</div>
          {sharedWarnings.map((warning, index) => (
            <div key={`${warning}-${index}`}>{warning}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

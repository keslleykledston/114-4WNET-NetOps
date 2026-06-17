import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MatrixSemanticView } from "./announcement-types";

interface GlobalDependenciesPanelProps {
  semanticView: MatrixSemanticView | undefined;
}

export function GlobalDependenciesPanel({ semanticView }: GlobalDependenciesPanelProps) {
  const globals = semanticView?.protectedGlobals ?? [];
  const notices = semanticView?.warnings.protectedGlobalNotices ?? [];

  if (globals.length === 0 && notices.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-[12px] text-muted-foreground">
        Nenhum objeto global protegido identificado neste snapshot.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Objetos globais (community-filter, ip-prefix, route-policy base) são protegidos e não devem ser removidos nem tratados como dependência exclusiva de um circuito.
      </p>
      {globals.map((item) => (
        <Card key={item.objectName} className="border-border bg-card/40">
          <CardHeader className="py-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-[13px] font-mono">
              {item.objectName}
              <Badge variant="outline" className="text-[10px]">Global protegido</Badge>
              <Badge variant="secondary" className="text-[10px]">{item.objectKind}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-3 text-[11px] text-muted-foreground">
            <div>{item.reason}</div>
            <div>Consumidores: {item.consumerCount}</div>
            {item.consumers.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {item.consumers.map((consumer) => (
                  <Badge key={consumer} variant="outline" className="font-mono text-[10px]">{consumer}</Badge>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
      {notices.length > 0 ? (
        <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3 text-[11px] text-sky-100">
          {notices.map((notice, index) => (
            <div key={`${notice}-${index}`}>{notice}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

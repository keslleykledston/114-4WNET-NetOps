import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  approveCopilotAlias,
  getCopilotAliasStats,
  listCopilotAliases,
  rejectCopilotAlias,
} from "./copilot-api";

const DEFAULT_TENANT_ID = 1;

export function CopilotAliasesPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  const statsQuery = useQuery({
    queryKey: ["copilot-alias-stats", DEFAULT_TENANT_ID],
    queryFn: () => getCopilotAliasStats(DEFAULT_TENANT_ID),
    staleTime: 30_000,
  });

  const aliasesQuery = useQuery({
    queryKey: ["copilot-aliases", DEFAULT_TENANT_ID, "pending"],
    queryFn: () => listCopilotAliases(DEFAULT_TENANT_ID, "pending"),
    staleTime: 15_000,
  });

  const approve = useMutation({
    mutationFn: (aliasId: number) => approveCopilotAlias({ aliasId, tenantId: DEFAULT_TENANT_ID }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["copilot-aliases"] });
      void queryClient.invalidateQueries({ queryKey: ["copilot-alias-stats"] });
    },
  });

  const reject = useMutation({
    mutationFn: (aliasId: number) => rejectCopilotAlias({ aliasId, tenantId: DEFAULT_TENANT_ID }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["copilot-aliases"] });
      void queryClient.invalidateQueries({ queryKey: ["copilot-alias-stats"] });
    },
  });

  const pending = aliasesQuery.data?.aliases ?? [];
  const stats = statsQuery.data?.stats;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Aliases aprendidos</CardTitle>
        <CardDescription>
          Propostas de entidades (feedback e baixa confiança). Aprovacao admin necessaria.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats ? (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">pendentes: {stats.pending}</Badge>
            <Badge variant="secondary">aprovados: {stats.approved}</Badge>
            <Badge variant="outline">rejeitados: {stats.rejected}</Badge>
          </div>
        ) : null}

        {aliasesQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando fila...
          </div>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum alias pendente.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <div>
                  <span className="font-medium">{row.alias}</span>
                  <span className="text-muted-foreground"> → {row.canonicalName ?? row.alias}</span>
                  <span className="ml-2 text-xs text-muted-foreground">({row.entityType})</span>
                </div>
                {isAdmin ? (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={approve.isPending || reject.isPending}
                      onClick={() => approve.mutate(row.id)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      disabled={approve.isPending || reject.isPending}
                      onClick={() => reject.mutate(row.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Badge variant="outline">aguarda admin</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

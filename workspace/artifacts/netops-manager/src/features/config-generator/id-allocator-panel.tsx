import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw } from "lucide-react";
import {
  useConfigGeneratorIdInventory,
  useConfigGeneratorIdSuggest,
  useRefreshConfigGeneratorIdInventory,
} from "./id-allocator-api";

type Props = {
  tenantId: number | null;
  deviceId: number | null;
  serviceType: string | null;
  fieldOrigins?: Record<string, string | undefined>;
  onApplySuggestion?: (field: string, value: number) => void;
  canRefresh?: boolean;
};

function badgeForId(value: number, used: number[], reserved?: boolean) {
  if (reserved) return { label: "reservado", variant: "destructive" as const };
  if (used.includes(value)) return { label: "ocupado", variant: "destructive" as const };
  return { label: "disponível", variant: "outline" as const };
}

export function ConfigGeneratorIdAllocatorPanel({
  tenantId,
  deviceId,
  serviceType,
  fieldOrigins,
  onApplySuggestion,
  canRefresh = false,
}: Props) {
  const inventoryQuery = useConfigGeneratorIdInventory(tenantId, deviceId, Boolean(tenantId));
  const suggestQuery = useConfigGeneratorIdSuggest(tenantId, deviceId, serviceType, Boolean(tenantId && serviceType));
  const refreshMutation = useRefreshConfigGeneratorIdInventory();

  const summary = inventoryQuery.data?.summary ?? {};
  const suggestions = suggestQuery.data?.suggestions;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">IDs em uso</CardTitle>
            <CardDescription>Device / tenant — inventário normalizado</CardDescription>
          </div>
          {canRefresh && tenantId ? (
            <Button
              variant="outline"
              size="sm"
              disabled={refreshMutation.isPending}
              onClick={() => refreshMutation.mutate({ tenantId, deviceId })}
            >
              {refreshMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {(["vlan", "subinterface", "l2vc", "vsi"] as const).map((type) => (
            <div key={type}>
              <p className="font-medium capitalize">{type === "subinterface" ? "Subinterfaces" : type.toUpperCase()}</p>
              <p className="font-mono text-muted-foreground">
                {(summary[type] ?? []).length > 0 ? (summary[type] ?? []).join(", ") : "—"}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sugestão de ID</CardTitle>
          <CardDescription>
            {serviceType ? `Serviço ${serviceType}` : "Selecione template/serviço"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {suggestQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {suggestions?.vlan ? (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">VLAN {suggestions.vlan.value}</span>
                <Badge variant="secondary">range {suggestions.vlan.range}</Badge>
                <Badge variant={badgeForId(suggestions.vlan.value, summary.vlan ?? []).variant}>
                  {fieldOrigins?.vlan === "manual" ? "manual" : "dentro do padrão"}
                </Badge>
              </div>
              <p className="text-muted-foreground">{suggestions.vlan.reason}</p>
              <p className="text-xs">Origem: sugerido pelo alocador de IDs</p>
              {onApplySuggestion ? (
                <Button size="sm" variant="outline" onClick={() => onApplySuggestion("vlan", suggestions.vlan!.value)}>
                  Aplicar VLAN
                </Button>
              ) : null}
            </div>
          ) : null}
          {(["subinterfaceId", "l2vcId", "vsiId"] as const).map((key) => {
            const item = suggestions?.[key];
            if (!item) return null;
            return (
              <div key={key} className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{key} {item.value}</span>
                  {item.scope ? <Badge variant="outline">{item.scope}</Badge> : null}
                </div>
                <p className="text-muted-foreground mt-1">{item.reason}</p>
                {onApplySuggestion ? (
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => onApplySuggestion(key, item.value)}>
                    Aplicar
                  </Button>
                ) : null}
              </div>
            );
          })}
          {(suggestQuery.data?.warnings ?? []).map((item) => (
            <p key={item.code} className="text-amber-600">{item.message}</p>
          ))}
          {(suggestQuery.data?.blockingConflicts ?? []).map((item) => (
            <p key={item.code} className="text-destructive">{item.message}</p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

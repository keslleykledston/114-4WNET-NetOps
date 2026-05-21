import { useMemo, useState } from "react";
import {
  getListIntegrationsQueryKey,
  useListIntegrations,
  useUpdateIntegration,
  type IntegrationSetting,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Globe2, Webhook, Activity, Save } from "lucide-react";

type IntegrationCard = {
  name: "netbox" | "future_webhook" | "future_zabbix";
  title: string;
  description: string;
  icon: typeof Globe2;
};

const cards: IntegrationCard[] = [
  {
    name: "netbox",
    title: "NetBox",
    description: "Readiness only. No sync or token persistence in MVP.",
    icon: Globe2,
  },
  {
    name: "future_webhook",
    title: "Webhook",
    description: "Prepared for future event delivery.",
    icon: Webhook,
  },
  {
    name: "future_zabbix",
    title: "Zabbix",
    description: "Prepared for future monitoring integration.",
    icon: Activity,
  },
];

export default function IntegrationsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: integrations, isLoading } = useListIntegrations();
  const updateIntegration = useUpdateIntegration();
  const [drafts, setDrafts] = useState<Record<string, { enabled: boolean; baseUrl: string; notes: string }>>({});

  const byName = useMemo(() => {
    const map = new Map<string, IntegrationSetting>();
    integrations?.forEach((item) => map.set(item.name, item));
    return map;
  }, [integrations]);

  const getDraft = (name: string) => {
    const existing = byName.get(name);
    if (!existing) return { enabled: false, baseUrl: "", notes: "" };
    return drafts[name] ?? {
      enabled: existing.enabled,
      baseUrl: typeof existing.configJson?.baseUrl === "string" ? existing.configJson.baseUrl : "",
      notes: typeof existing.configJson?.notes === "string" ? existing.configJson.notes : "",
    };
  };

  const saveIntegration = (name: string) => {
    const draft = getDraft(name);
    updateIntegration.mutate({
      name,
      data: {
        enabled: draft.enabled,
        configJson: {
          baseUrl: draft.baseUrl || null,
          notes: draft.notes || "Integração preparada para fase futura",
          readiness: "future",
          tokenConfigured: false,
        },
      },
    }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListIntegrationsQueryKey() });
        toast({ title: "Integração salva" });
      },
      onError: () => toast({ title: "Falha ao salvar integração", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="mt-1 text-muted-foreground">Readiness settings for future integrations</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {cards.map((card) => {
          const integration = byName.get(card.name);
          const draft = getDraft(card.name);
          const Icon = card.icon;

          return (
            <Card key={card.name}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3 text-base">
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {card.title}
                  </span>
                  <Badge variant={draft.enabled ? "default" : "outline"}>
                    {draft.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{card.description}</p>

                {card.name === "netbox" && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base URL</div>
                    <Input
                      value={draft.baseUrl}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [card.name]: { ...draft, baseUrl: event.target.value },
                      }))}
                      placeholder="https://netbox.example.com"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</div>
                  <Input
                    value={draft.notes}
                    onChange={(event) => setDrafts((current) => ({
                      ...current,
                      [card.name]: { ...draft, notes: event.target.value },
                    }))}
                    placeholder="Integração preparada para fase futura"
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">Enabled</div>
                    <div className="text-xs text-muted-foreground">Readiness only. No token storage.</div>
                  </div>
                  <Switch
                    checked={draft.enabled}
                    onCheckedChange={(checked) => setDrafts((current) => ({
                      ...current,
                      [card.name]: { ...draft, enabled: checked },
                    }))}
                  />
                </div>

                <div className="text-xs text-muted-foreground">
                  {integration?.configJson?.readiness ? `Readiness: ${String(integration.configJson.readiness)}` : "Readiness: future"}
                </div>

                <Button className="w-full" onClick={() => saveIntegration(card.name)} disabled={updateIntegration.isPending || isLoading}>
                  <Save className="mr-2 h-4 w-4" />
                  Save readiness
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}


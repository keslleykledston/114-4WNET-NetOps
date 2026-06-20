import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useVsiVplsDetail } from "./vsi-vpls-api";
import { summarizeVsiVplsConfigBlocks, summarizeVsiVplsTrafficDelivery } from "./vsi-vpls-config-summary";

function formatTs(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function SectionTitle({ title }: { title: string }) {
  return <p className="text-sm font-medium text-muted-foreground">{title}</p>;
}

function CopyButton({ text }: { text: string }) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
      }}
    >
      Copiar config
    </Button>
  );
}

export function VsiVplsDetailSheet({ id, open, onOpenChange }: { id: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, isLoading, isError, error } = useVsiVplsDetail(open ? id : null);
  const [expandedDevice, setExpandedDevice] = useState<number | null>(null);
  const serviceVsId = data?.service.vs_id ?? null;
  const serviceName = data?.service.name ?? null;

  const configMap = useMemo(() => {
    const map = new Map<number, ReturnType<typeof summarizeVsiVplsConfigBlocks>>();
    data?.configs_metadata.forEach((config) => {
      if (config.raw_config) map.set(config.device_id, summarizeVsiVplsConfigBlocks(config.raw_config, serviceVsId, serviceName));
    });
    return map;
  }, [data?.configs_metadata, serviceName, serviceVsId]);

  const deliveryMap = useMemo(() => {
    const map = new Map<number, ReturnType<typeof summarizeVsiVplsTrafficDelivery>>();
    configMap.forEach((blocks, deviceId) => {
      map.set(deviceId, summarizeVsiVplsTrafficDelivery(blocks));
    });
    return map;
  }, [configMap]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
        <SheetHeader className="pr-8">
          <SheetTitle>VSI / VPLS Detail</SheetTitle>
          <SheetDescription>Read-only. Configs recolhidas por device e historico derivado do inventario persistido.</SheetDescription>
        </SheetHeader>

        {isLoading && <p className="mt-6 text-sm text-muted-foreground">Carregando...</p>}
        {isError && <p className="mt-6 text-sm text-destructive">{error instanceof Error ? error.message : "Falha ao carregar detalhe"}</p>}

        {data && (
          <div className="mt-6 space-y-5">
            <div className="grid gap-2 text-sm">
              <div><span className="text-muted-foreground">Tenant:</span> {data.service.tenant_name}</div>
              <div><span className="text-muted-foreground">VS-ID:</span> {data.service.vs_id ?? "sem vs-id"}</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Status:</span>
                <Badge>{data.service.status}</Badge>
                <span className="text-muted-foreground">Divergência:</span>
                <Badge variant={data.service.has_divergence ? "destructive" : "secondary"}>
                  {data.service.has_divergence ? "Sim" : "Não"}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Metric label="Sites" value={String(data.service.sites_count)} />
              <Metric label="Dispositivos" value={String(data.service.devices_count)} />
              <Metric label="PWs" value={`${data.service.pws_up_count}/${data.service.pws_count} UP`} />
              <Metric label="Alarmes" value={`${data.service.alarms_count}${data.service.alarms_count > 0 ? " ativo(s)" : ""}`} tone={data.service.alarms_count > 0 ? "warning" : "neutral"} />
            </div>

            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="grid w-full grid-cols-7">
                <TabsTrigger value="summary">Resumo</TabsTrigger>
                <TabsTrigger value="members">Circuitos / Membros</TabsTrigger>
                <TabsTrigger value="devices">Dispositivos</TabsTrigger>
                <TabsTrigger value="configs">Configurações</TabsTrigger>
                <TabsTrigger value="alarms">Alarmes</TabsTrigger>
                <TabsTrigger value="topology">Topologia</TabsTrigger>
                <TabsTrigger value="history">Histórico</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="space-y-3 pt-4">
                <SectionTitle title="Diagnóstico" />
                <p className="text-sm">{data.diagnosis.reason}</p>
                <div className="flex flex-wrap gap-2">
                  {data.diagnosis.evidence.map((item) => (
                    <Badge key={item} variant="outline">{item}</Badge>
                  ))}
                </div>
                <Separator />
                <SectionTitle title="Resumo do serviço" />
                <p className="text-sm text-muted-foreground">
                  Tenant {data.service.tenant_name} com {data.service.devices_count} dispositivo(s), {data.service.sites_count} site(s), última coleta {formatTs(data.service.last_collected_at)}.
                </p>
              </TabsContent>

              <TabsContent value="members" className="pt-4 space-y-3">
                {data.members.map((member) => (
                  <div key={member.circuit_id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{member.device_name}</div>
                        <div className="text-xs text-muted-foreground">{member.site} · {member.local_interface ?? "interface indisponível"}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge>{member.oper_status}</Badge>
                        <Badge variant="outline">{member.vsi_name ?? member.name}</Badge>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
                      <div>Peer: {member.peer_ip ?? "—"}</div>
                      <div>PW: {member.pw_status ?? "—"}</div>
                      <div>VLAN: {member.outer_vlan ?? "—"}</div>
                      <div>Última coleta: {formatTs(member.last_seen)}</div>
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="devices" className="pt-4 space-y-3">
                {data.members.map((member) => (
                  <div key={member.device_id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{member.device_name}</div>
                        <div className="text-xs text-muted-foreground">{member.vendor} · {member.site}</div>
                      </div>
                      <Badge variant="outline">{member.source}</Badge>
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="configs" className="pt-4 space-y-3">
                {data.configs_metadata.map((config) => {
                  const expanded = expandedDevice === config.device_id;
                  const blocks = configMap.get(config.device_id) ?? [];
                  const delivery = deliveryMap.get(config.device_id) ?? { tagged: [], untagged: [], interfaces: [], summaryText: "sem interfaces agregadas" };
                  const serviceBlock = blocks.find((block) => block.mode === "service") ?? null;
                  const vlanifBlocks = blocks.filter((block) => block.mode !== "service");
                  return (
                    <div key={config.device_id} className="rounded-md border">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                        onClick={() => setExpandedDevice(expanded ? null : config.device_id)}
                      >
                        <div>
                          <div className="font-medium">{config.device_name}</div>
                          <div className="text-xs text-muted-foreground">{config.site} · {formatTs(config.collected_at)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{config.parser_status ?? "raw"}</Badge>
                          <CopyButton text={blocks.map((block) => block.raw).join("\n#\n")} />
                        </div>
                      </button>
                      {expanded ? (
                        <div className="border-t">
                          {blocks.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground">Sem config armazenada</div>
                          ) : (
                            <div className="space-y-3 p-3">
                              <div className="rounded-md border bg-muted/20 p-3">
                                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resumo rápido</div>
                                <div className="mt-1 text-sm">{delivery.summaryText}</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {delivery.tagged.length > 0 ? <Badge variant="default">Tagged: {delivery.tagged.join(", ")}</Badge> : null}
                                  {delivery.untagged.length > 0 ? <Badge variant="secondary">Untagged: {delivery.untagged.join(", ")}</Badge> : null}
                                </div>
                              </div>

                              {serviceBlock ? (
                                <div className="rounded-md border bg-muted/10">
                                  <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                                    <div>
                                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{serviceBlock.title}</div>
                                      <div className="text-xs text-muted-foreground">{serviceBlock.subtitle}</div>
                                    </div>
                                    <CopyButton text={serviceBlock.raw} />
                                  </div>
                                  <ScrollArea className="max-h-56">
                                    <pre className="whitespace-pre-wrap break-words p-3 font-mono text-xs">{serviceBlock.raw}</pre>
                                  </ScrollArea>
                                </div>
                              ) : null}

                              {vlanifBlocks.length > 0 ? (
                                <div className="rounded-md border bg-muted/10">
                                  <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                                    <div>
                                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Config técnica</div>
                                      <div className="text-xs text-muted-foreground">{delivery.summaryText}</div>
                                    </div>
                                    <CopyButton text={vlanifBlocks.map((block) => block.raw).join("\n#\n")} />
                                  </div>
                                  <div className="space-y-3 p-3">
                                    {vlanifBlocks.map((block, index) => (
                                      <div key={`${config.device_id}-vlanif-${index}`} className="rounded-md border bg-background/40">
                                        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                                          <div>
                                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{block.title}</div>
                                            <div className="text-xs text-muted-foreground">{block.subtitle}</div>
                                          </div>
                                          <Badge variant={block.mode === "tagged" ? "default" : "secondary"}>{block.mode}</Badge>
                                        </div>
                                        <ScrollArea className="max-h-56">
                                          <pre className="whitespace-pre-wrap break-words p-3 font-mono text-xs">{block.raw}</pre>
                                        </ScrollArea>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent value="alarms" className="pt-4 space-y-3">
                {data.alarms.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem alarmes relevantes.</p>
                ) : data.alarms.map((alarm, idx) => (
                  <div key={`${alarm.device_id}-${alarm.code}-${idx}`} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{alarm.device_name}</Badge>
                      <Badge>{alarm.severity}</Badge>
                      <Badge variant="secondary">{alarm.code}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{alarm.message}</p>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="topology" className="pt-4">
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Topologia MVP: resumo textual de membros e peers. Evoluir para grafo apenas se houver componente já padronizado.
                </div>
              </TabsContent>

              <TabsContent value="history" className="pt-4 space-y-3">
                {data.history_summary.map((event) => (
                  <div key={event.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{event.event_type}</Badge>
                      {event.status ? <Badge>{event.status}</Badge> : null}
                      {event.severity ? <Badge variant="secondary">{event.severity}</Badge> : null}
                    </div>
                    <div className="mt-2 text-sm">{event.reason}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatTs(event.created_at)}</div>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warning" }) {
  return (
    <div className={`rounded-md border p-3 ${tone === "warning" ? "border-amber-500/40 bg-amber-500/10" : "bg-muted/20"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

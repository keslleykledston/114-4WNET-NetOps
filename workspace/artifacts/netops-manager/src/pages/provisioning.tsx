import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListDevices } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useL2Circuits } from "@/features/l2-circuits/l2-circuits-api";
import { circuitTypeGroup } from "@/features/l2-circuits/l2-circuit-badges";
import { AlertTriangle, ArrowRight, CheckCircle2, Layers3, Network, ShieldCheck } from "lucide-react";

type FocusTab = "overview" | "vpws" | "vpls" | "validations" | "history";

function severityLabel(count: number, kind: "ok" | "warn" | "info") {
  if (kind === "ok") return `${count} OK`;
  if (kind === "warn") return `${count} atenção`;
  return `${count} info`;
}

export default function Provisioning() {
  const [focus, setFocus] = useState<FocusTab>("overview");
  const { data } = useL2Circuits();
  const { data: devices } = useListDevices();

  const circuits = data?.circuits ?? [];
  const summary = useMemo(() => {
    const local = circuits.filter((c) => circuitTypeGroup(c.circuitType) === "local");
    const mpls = circuits.filter((c) => circuitTypeGroup(c.circuitType) === "mpls");
    const vsi = circuits.filter((c) => circuitTypeGroup(c.circuitType) === "vsi");
    const up = circuits.filter((c) => c.operStatus === "UP").length;
    const down = circuits.filter((c) => c.operStatus === "DOWN").length;
    const partial = circuits.filter((c) => c.operStatus === "PARTIAL").length;
    const findings = circuits.filter((c) => c.findings.length > 0).length;
    return {
      total: circuits.length,
      local: local.length,
      mpls: mpls.length,
      vsi: vsi.length,
      up,
      down,
      partial,
      findings,
    };
  }, [circuits]);

  const topIssues = useMemo(
    () => circuits.filter((c) => c.findings.length > 0).slice(0, 5),
    [circuits],
  );

  const recent = useMemo(() => circuits.slice(0, 6), [circuits]);

  const activeDevices = devices?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950 p-6 text-slate-50 shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-cyan-300">
              <Layers3 className="h-5 w-5" />
              <span className="text-sm font-medium">L2VPN</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Gestão de Circuitos L2VPN
            </h1>
            <p className="max-w-3xl text-sm text-slate-300">
              Visão simples para enxergar circuitos L2, validar coerência entre VLAN, Vlanif e VSI, e abrir detalhe sem cair em falso alarme.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-cyan-400/40 bg-cyan-500/10 text-cyan-200">
              {severityLabel(summary.up, "ok")}
            </Badge>
            <Badge variant="outline" className="border-amber-400/40 bg-amber-500/10 text-amber-200">
              {severityLabel(summary.down + summary.partial, "warn")}
            </Badge>
            <Badge variant="outline" className="border-slate-400/40 bg-slate-500/10 text-slate-200">
              {summary.total} circuitos
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Circuitos L2</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total}</div>
            <CardDescription>Base descoberta no Tenant</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">L2 local</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.local}</div>
            <CardDescription>VLAN local, trunk e Vlanif</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">MPLS / L2VPN</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.mpls}</div>
            <CardDescription>VPWS, PW e correlações</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">VSI / VPLS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.vsi}</div>
            <CardDescription>Multiponto e peers</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Dispositivos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeDevices}</div>
            <CardDescription>Fontes para validação</CardDescription>
          </CardContent>
        </Card>
      </div>

      <Tabs value={focus} onValueChange={(value) => setFocus(value as FocusTab)} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 md:grid-cols-5">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="vpws">L2VC / VPWS</TabsTrigger>
          <TabsTrigger value="vpls">VSI / VPLS</TabsTrigger>
          <TabsTrigger value="validations">Validações</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Entrada rápida</CardTitle>
                <CardDescription>Os atalhos abaixo levam para a visão operacional do L2.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <Button asChild variant="outline" className="justify-between">
                  <Link href="/l2-circuits">
                    Abrir Circuitos L2
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-between">
                  <Link href="/provisioning/templates">
                    Ver templates
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-between">
                  <Link href="/provisioning/service-catalog">
                    Catálogo
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status resumido</CardTitle>
                <CardDescription>Leitura de saúde do conjunto.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>UP</span><span className="font-medium text-emerald-500">{summary.up}</span></div>
                <div className="flex items-center justify-between"><span>DOWN</span><span className="font-medium text-red-500">{summary.down}</span></div>
                <div className="flex items-center justify-between"><span>PARTIAL</span><span className="font-medium text-amber-500">{summary.partial}</span></div>
                <div className="flex items-center justify-between"><span>Com findings</span><span className="font-medium">{summary.findings}</span></div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sinais de atenção</CardTitle>
                <CardDescription>Mostra os circuitos com evidência de conflito, vazio ou divergência.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {topIssues.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Sem alarmes no recorte atual.
                  </div>
                ) : (
                  topIssues.map((circuit) => (
                    <div key={circuit.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">{circuit.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Device #{circuit.deviceId} · VLAN {circuit.outerVlan ?? "n/a"}
                          </div>
                        </div>
                        <Badge variant={circuit.operStatus === "DOWN" ? "destructive" : "secondary"}>
                          {circuit.operStatus}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {circuit.findings.slice(0, 2).map((finding) => (
                          <Badge key={finding.code} variant="outline">
                            {finding.code}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Guia rápido</CardTitle>
                <CardDescription>Fluxo simples para o operador não técnico.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex gap-3">
                  <div className="mt-0.5 rounded-full bg-cyan-500/15 p-2 text-cyan-500"><Network className="h-4 w-4" /></div>
                  <div>
                    <div className="font-medium">1. Ver circuito</div>
                    <div className="text-muted-foreground">Abrir o detalhe e olhar status, VLAN e portas ativas.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="mt-0.5 rounded-full bg-amber-500/15 p-2 text-amber-500"><AlertTriangle className="h-4 w-4" /></div>
                  <div>
                    <div className="font-medium">2. Validar evidência</div>
                    <div className="text-muted-foreground">Se a VLAN existe e está ativa, Vlanif vazia não vira crítico.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="mt-0.5 rounded-full bg-emerald-500/15 p-2 text-emerald-500"><ShieldCheck className="h-4 w-4" /></div>
                  <div>
                    <div className="font-medium">3. Confirmar serviço</div>
                    <div className="text-muted-foreground">Se houver binding VSI, seguir o status da VSI, não da Vlanif solta.</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="vpws" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>L2VC / VPWS</CardTitle>
              <CardDescription>Visão de circuito ponto-a-ponto. A ideia é ver as duas pontas sem ruído técnico.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border p-4">
                <div className="text-sm font-medium">O que olhar</div>
                <p className="mt-2 text-sm text-muted-foreground">VLAN, PW-ID, porta de acesso, peer remoto e estado do pseudowire.</p>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm font-medium">Quando acusar</div>
                <p className="mt-2 text-sm text-muted-foreground">Só chamar DOWN quando houver falta real de evidência nas pontas ou PW sem vida.</p>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm font-medium">Ação sugerida</div>
                <p className="mt-2 text-sm text-muted-foreground">Abrir detalhe do circuito e comparar ponta A x ponta B.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vpls" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>VSI / VPLS</CardTitle>
              <CardDescription>Visão multiponto. Aqui o foco é membro, peer e consistência de identificação.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border p-4">
                <div className="text-sm font-medium">O que olhar</div>
                <p className="mt-2 text-sm text-muted-foreground">VS-ID, nome da VSI, peers, PWs, ACs e membro faltante.</p>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm font-medium">Regra principal</div>
                <p className="mt-2 text-sm text-muted-foreground">Se houver l2 binding vsi, a classificação sai do modo VLAN local simples.</p>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm font-medium">Ação sugerida</div>
                <p className="mt-2 text-sm text-muted-foreground">Conferir status da VSI e do pseudowire associado.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Validações</CardTitle>
              <CardDescription>Checklist curto para evitar alarme falso.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border p-4 text-sm">VLAN existe no switch</div>
              <div className="rounded-lg border p-4 text-sm">VLAN state up e portas tagged/active</div>
              <div className="rounded-lg border p-4 text-sm">Vlanif vazia não vira crítico sozinha</div>
              <div className="rounded-lg border p-4 text-sm">Binding VSI muda a leitura do circuito</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Histórico recente</CardTitle>
              <CardDescription>Últimos circuitos visíveis na coleta atual.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recent.length === 0 ? (
                <div className="text-sm text-muted-foreground">Sem dados para mostrar.</div>
              ) : (
                recent.map((circuit) => (
                  <div key={circuit.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="font-medium">{circuit.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Device #{circuit.deviceId} · {circuit.circuitType} · VLAN {circuit.outerVlan ?? "n/a"}
                      </div>
                    </div>
                    <Badge variant={circuit.operStatus === "UP" ? "default" : "secondary"}>{circuit.operStatus}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

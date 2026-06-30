import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ArrowUpRight, CheckCircle2, Diff, Layers3, PenLine, ShieldAlert, Sparkles } from "lucide-react";
import { useL2VPNCircuits, useL2VPNStats, compareL2VPNCircuits, createL2VPNDraft, type L2VPNComparison } from "@/lib/api/l2vpn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useToast } from "@/hooks/use-toast";

const chartConfig = {
  up: { label: "UP", color: "hsl(var(--chart-4))" },
  degraded: { label: "DEGRADED", color: "hsl(var(--chart-3))" },
  down: { label: "DOWN", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

function MetricCard({ title, value, accent, hint }: { title: string; value: number; accent: string; hint: string }) {
  return (
    <Card className="group relative overflow-hidden border-white/10 bg-white/[0.04] shadow-2xl shadow-cyan-950/20 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.06]">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-300">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-4xl font-semibold tracking-tight text-white transition-transform duration-300 group-hover:scale-[1.02]">{value}</div>
        <div className="text-xs text-slate-400">{hint}</div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 rounded-3xl border border-white/10 bg-slate-950/50 p-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="border-white/10 bg-white/[0.04]">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24 bg-white/10" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-12 w-20 bg-white/10" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ComparisonPanel({
  comparison,
}: {
  comparison: L2VPNComparison | null;
}) {
  if (!comparison) {
    return <div className="text-sm text-slate-400">Sem comparação ainda.</div>;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-100">
          {comparison.status}
        </Badge>
        <span className="text-sm text-slate-400">{comparison.recommendedAction}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
          <div className="text-sm font-semibold text-white">{comparison.left.name}</div>
          <div className="mt-1 text-xs text-slate-400">{comparison.left.device} · {comparison.left.site}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
          <div className="text-sm font-semibold text-white">{comparison.right.name}</div>
          <div className="mt-1 text-xs text-slate-400">{comparison.right.device} · {comparison.right.site}</div>
        </div>
      </div>
      <div className="space-y-2">
        {comparison.diffs.map((diff) => (
          <div key={diff.field} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm">
            <span className="text-slate-300">{diff.field}</span>
            <span className={diff.match ? "text-emerald-300" : "text-amber-300"}>
              {diff.match ? "OK" : `${String(diff.left ?? "n/a")} → ${String(diff.right ?? "n/a")}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function L2VPNDashboard() {
  const { data: stats, isLoading } = useL2VPNStats();
  const { data: circuitsData } = useL2VPNCircuits();
  const [leftCircuitId, setLeftCircuitId] = useState("");
  const [rightCircuitId, setRightCircuitId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [comparison, setComparison] = useState<L2VPNComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const { toast } = useToast();

  const summary = stats ?? { total: 0, up: 0, degraded: 0, down: 0, circuits: [] };
  const circuits = circuitsData?.circuits ?? [];

  const doughnutData = useMemo(
    () => [
      { name: "UP", value: summary.up, fill: "hsl(var(--chart-4))" },
      { name: "DEGRADED", value: summary.degraded, fill: "hsl(var(--chart-3))" },
      { name: "DOWN", value: summary.down, fill: "hsl(var(--chart-1))" },
    ],
    [summary],
  );

  const trendData = useMemo(
    () => [
      { name: "UP", value: summary.up },
      { name: "DEGRADED", value: summary.degraded },
      { name: "DOWN", value: summary.down },
    ],
    [summary],
  );

  async function runComparison() {
    const left = Number(leftCircuitId);
    const right = Number(rightCircuitId);
    if (!left || !right) {
      toast({ title: "Selecione as duas pontas", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const result = await compareL2VPNCircuits(left, right);
      setComparison(result);
    } catch (error) {
      toast({
        title: "Falha na comparação",
        description: error instanceof Error ? error.message : "",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    const left = Number(leftCircuitId);
    const right = Number(rightCircuitId);
    if (!left || !right || !draftTitle.trim()) {
      toast({ title: "Título e circuitos obrigatórios", variant: "destructive" });
      return;
    }
    setDraftBusy(true);
    try {
      const result = await createL2VPNDraft({
        title: draftTitle.trim(),
        circuitIds: [left, right],
        notes: draftNotes.trim(),
        validation: comparison,
      });
      toast({
        title: "Draft salvo",
        description: `Rascunho #${result.id ?? "n/a"} criado para supervisão.`,
      });
    } catch (error) {
      toast({
        title: "Falha ao salvar draft",
        description: error instanceof Error ? error.message : "",
        variant: "destructive",
      });
    } finally {
      setDraftBusy(false);
    }
  }

  if (isLoading) return <LoadingSkeleton />;

  return (
    <section className="relative min-h-[calc(100vh-4rem)] overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_32%),linear-gradient(135deg,_#050816_0%,_#0d0d2b_45%,_#15153b_100%)] px-6 py-8 text-white shadow-2xl shadow-slate-950/40 md:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:18px_18px]" />
      <div className="relative space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <Badge variant="outline" className="border-cyan-400/30 bg-cyan-500/10 text-cyan-200">
              <Sparkles className="mr-2 h-3.5 w-3.5" />
              L2VPN Dashboard
            </Badge>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Abstração e validação L2VPN</h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                Circuitos, diferenças entre as pontas e draft supervisionado. Sem apply real.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-100"><Layers3 className="mr-2 h-3.5 w-3.5" />{summary.total} circuitos</Badge>
            <Badge variant="outline" className="border-emerald-400/20 bg-emerald-500/10 text-emerald-200"><CheckCircle2 className="mr-2 h-3.5 w-3.5" />{summary.up} UP</Badge>
            <Badge variant="outline" className="border-amber-400/20 bg-amber-500/10 text-amber-200"><ShieldAlert className="mr-2 h-3.5 w-3.5" />{summary.degraded} degraded</Badge>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Total" value={summary.total} hint="Base consolidada do Tenant" accent="from-cyan-400 via-blue-400 to-indigo-400" />
          <MetricCard title="UP" value={summary.up} hint="Circuitos saudáveis" accent="from-emerald-400 via-green-400 to-cyan-400" />
          <MetricCard title="Degraded" value={summary.degraded} hint="Sinais de atenção" accent="from-amber-400 via-orange-400 to-rose-400" />
          <MetricCard title="Down" value={summary.down} hint="Impacto direto" accent="from-rose-400 via-red-500 to-orange-500" />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-white/10 bg-white/[0.04] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white"><Diff className="h-4 w-4 text-cyan-300" />Comparação</CardTitle>
              <CardDescription className="text-slate-400">Escolha duas pontas e valide VLAN, VC-ID, VSI, interface e peer.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={leftCircuitId} onChange={(e) => setLeftCircuitId(e.target.value)} placeholder="Circuito A (ID)" />
                <Input value={rightCircuitId} onChange={(e) => setRightCircuitId(e.target.value)} placeholder="Circuito B (ID)" />
              </div>
              <Button onClick={() => void runComparison()} disabled={busy} className="w-full">
                {busy ? "Validando..." : "Validar pontas"}
              </Button>
              <ComparisonPanel comparison={comparison} />
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.04] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white"><PenLine className="h-4 w-4 text-cyan-300" />Draft supervisionado</CardTitle>
              <CardDescription className="text-slate-400">Rascunho para revisão humana. Não aplica nada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Título do draft" />
              <Textarea value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} placeholder="Notas para supervisão" />
              <Button onClick={() => void saveDraft()} disabled={draftBusy} className="w-full">
                {draftBusy ? "Salvando..." : "Salvar draft"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-white/10 bg-white/[0.04] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white"><ArrowUpRight className="h-4 w-4 text-cyan-300" />Distribuição por status</CardTitle>
              <CardDescription className="text-slate-400">Vista visual do peso de cada estado.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <ResponsiveContainer>
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Pie data={doughnutData} dataKey="value" nameKey="name" innerRadius={82} outerRadius={124} paddingAngle={4}>
                        {doughnutData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.04] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white">Resumo operacional</CardTitle>
              <CardDescription className="text-slate-400">Leitura rápida do que existe hoje.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[260px] rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <ResponsiveContainer>
                    <BarChart data={trendData} barSize={52}>
                      <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                        {trendData.map((item, index) => (
                          <Cell key={item.name} fill={index === 0 ? "hsl(var(--chart-4))" : index === 1 ? "hsl(var(--chart-3))" : "hsl(var(--chart-1))"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-white/10 bg-white/[0.04] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Circuitos</CardTitle>
            <CardDescription className="text-slate-400">Seleciona as pontas aqui quando quiser validar ou draftar.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {circuits.slice(0, 6).map((circuit) => (
              <button
                key={circuit.id}
                onClick={() => {
                  if (!leftCircuitId) setLeftCircuitId(String(circuit.id));
                  else setRightCircuitId(String(circuit.id));
                }}
                className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-left transition-transform duration-300 hover:-translate-y-1 hover:border-white/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{circuit.name}</div>
                    <div className="mt-1 text-xs text-slate-400">{circuit.device} · {circuit.site}</div>
                  </div>
                  <Badge variant="outline" className={circuit.status === "UP" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : circuit.status === "DEGRADED" ? "border-amber-400/20 bg-amber-500/10 text-amber-200" : "border-rose-400/20 bg-rose-500/10 text-rose-200"}>
                    {circuit.status}
                  </Badge>
                </div>
                <div className="mt-4 space-y-2 text-sm text-slate-300">
                  <div>{circuit.type} · VLAN {circuit.outerVlan ?? "n/a"} · VC {circuit.vcId ?? "n/a"}</div>
                  <div className="text-slate-500">Clique para usar na comparação.</div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

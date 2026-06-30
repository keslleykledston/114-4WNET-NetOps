import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Activity, ArrowUpRight, Layers3, PieChart as PieIcon, ShieldAlert, Sparkles } from "lucide-react";
import { useL2VPNStats } from "@/lib/api/l2vpn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  up: { label: "UP", color: "hsl(var(--chart-4))" },
  degraded: { label: "DEGRADED", color: "hsl(var(--chart-3))" },
  down: { label: "DOWN", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

function MetricCard({
  title,
  value,
  delta,
  accent,
}: {
  title: string;
  value: number;
  delta: string;
  accent: string;
}) {
  return (
    <Card className="group relative overflow-hidden border-white/10 bg-white/[0.04] shadow-2xl shadow-cyan-950/20 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.06]">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-300">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-4xl font-semibold tracking-tight text-white transition-transform duration-300 group-hover:scale-[1.02]">
          {value}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ArrowUpRight className="h-3.5 w-3.5" />
          <span>{delta}</span>
        </div>
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
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-white/10 bg-white/[0.04]">
          <CardHeader>
            <Skeleton className="h-5 w-40 bg-white/10" />
            <Skeleton className="h-4 w-72 bg-white/10" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-72 w-full bg-white/10" />
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/[0.04]">
          <CardHeader>
            <Skeleton className="h-5 w-40 bg-white/10" />
            <Skeleton className="h-4 w-72 bg-white/10" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-72 w-full bg-white/10" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function L2VPNDashboard() {
  const { data, isLoading, error } = useL2VPNStats();
  const stats = data ?? { total: 0, up: 0, degraded: 0, down: 0, circuits: [] };

  const doughnutData = useMemo(
    () => [
      { name: "UP", value: stats.up, fill: "hsl(var(--chart-4))" },
      { name: "DEGRADED", value: stats.degraded, fill: "hsl(var(--chart-3))" },
      { name: "DOWN", value: stats.down, fill: "hsl(var(--chart-1))" },
    ],
    [stats],
  );

  const trendData = useMemo(
    () => [
      { name: "UP", value: stats.up },
      { name: "DEGRADED", value: stats.degraded },
      { name: "DOWN", value: stats.down },
    ],
    [stats],
  );

  if (isLoading) return <LoadingSkeleton />;
  if (error) {
    return (
      <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-red-200">
        Falha ao carregar o dashboard L2VPN.
      </div>
    );
  }

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
              <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
                L2VPN Dashboard
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                Leitura rápida do estado dos circuitos. Mais foco em sinal útil, menos ruído operacional.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-100">
              <Layers3 className="mr-2 h-3.5 w-3.5" />
              {stats.total} circuitos
            </Badge>
            <Badge variant="outline" className="border-emerald-400/20 bg-emerald-500/10 text-emerald-200">
              <Activity className="mr-2 h-3.5 w-3.5" />
              {stats.up} UP
            </Badge>
            <Badge variant="outline" className="border-amber-400/20 bg-amber-500/10 text-amber-200">
              <ShieldAlert className="mr-2 h-3.5 w-3.5" />
              {stats.degraded} degraded
            </Badge>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Total" value={stats.total} delta="Base consolidada do Tenant" accent="from-cyan-400 via-blue-400 to-indigo-400" />
          <MetricCard title="UP" value={stats.up} delta="Circuitos saudáveis" accent="from-emerald-400 via-green-400 to-cyan-400" />
          <MetricCard title="Degraded" value={stats.degraded} delta="Sinais de atenção" accent="from-amber-400 via-orange-400 to-rose-400" />
          <MetricCard title="Down" value={stats.down} delta="Impacto direto" accent="from-rose-400 via-red-500 to-orange-500" />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-white/10 bg-white/[0.04] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <PieIcon className="h-4 w-4 text-cyan-300" />
                Distribuição por status
              </CardTitle>
              <CardDescription className="text-slate-400">
                Vista visual do peso de cada estado.
              </CardDescription>
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
              <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-slate-300">
                {doughnutData.map((item) => (
                  <div key={item.name} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.fill }} />
                      {item.name}
                    </div>
                    <div className="text-lg font-semibold text-white">{item.value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.04] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <ArrowUpRight className="h-4 w-4 text-cyan-300" />
                Resumo operacional
              </CardTitle>
              <CardDescription className="text-slate-400">
                O que o operador precisa ver agora.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-emerald-400/10 bg-emerald-500/10 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">UP</div>
                  <div className="mt-2 text-3xl font-semibold">{stats.up}</div>
                </div>
                <div className="rounded-2xl border border-amber-400/10 bg-amber-500/10 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-amber-200/80">DEGRADED</div>
                  <div className="mt-2 text-3xl font-semibold">{stats.degraded}</div>
                </div>
                <div className="rounded-2xl border border-rose-400/10 bg-rose-500/10 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-rose-200/80">DOWN</div>
                  <div className="mt-2 text-3xl font-semibold">{stats.down}</div>
                </div>
              </div>

              <div className="h-[240px] rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <ResponsiveContainer>
                    <BarChart data={trendData} barSize={52}>
                      <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                        {trendData.map((item, index) => (
                          <Cell
                            key={item.name}
                            fill={index === 0 ? "hsl(var(--chart-4))" : index === 1 ? "hsl(var(--chart-3))" : "hsl(var(--chart-1))"}
                          />
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
            <CardTitle className="text-white">Topologia resumida</CardTitle>
            <CardDescription className="text-slate-400">
              Amostra dos circuitos retornados pela API.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {stats.circuits.slice(0, 6).map((circuit) => (
              <div
                key={circuit.id}
                className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 transition-transform duration-300 hover:-translate-y-1 hover:border-white/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{circuit.type}</div>
                    <div className="mt-1 text-xs text-slate-400">{circuit.id}</div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      circuit.status === "UP"
                        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                        : circuit.status === "DEGRADED"
                          ? "border-amber-400/20 bg-amber-500/10 text-amber-200"
                          : "border-rose-400/20 bg-rose-500/10 text-rose-200"
                    }
                  >
                    {circuit.status}
                  </Badge>
                </div>
                <div className="mt-4 space-y-2 text-sm text-slate-300">
                  <div>{circuit.siteA}</div>
                  <div className="text-slate-500">→</div>
                  <div>{circuit.siteB}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

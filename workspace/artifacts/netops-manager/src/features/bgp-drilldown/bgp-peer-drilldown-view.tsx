import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Database, Info, Shield } from "lucide-react";
import type { BgpPeerDrilldownResult } from "./types";
import {
  AfiSafiBadge,
  ConfigSourceBadge,
  DependencyStatusBadge,
  PolicySourceBadge,
} from "./bgp-drilldown-badges";
import { BgpDrilldownCacheStatusBanner } from "./bgp-drilldown-cache-ux";
import { BgpPolicyTree } from "./bgp-policy-tree";

interface BgpPeerDrilldownViewProps {
  data?: BgpPeerDrilldownResult;
  loading?: boolean;
  error?: Error | null;
}

export function BgpPeerDrilldownSafetyBanner() {
  return (
    <Alert className="border-amber-500/30 bg-amber-500/5">
      <Shield className="h-4 w-4 text-amber-400" />
      <AlertTitle className="text-amber-200">Somente snapshot (read-only)</AlertTitle>
      <AlertDescription>
        Esta tela usa snapshot salvo. Não executa comandos no equipamento. Sem SSH detail, sem discovery, sem rotas received/accepted/advertised.
      </AlertDescription>
    </Alert>
  );
}

function BoolBadge({ value, label }: { value: boolean; label: string }) {
  if (!value) return null;
  return <Badge variant="outline" className="text-[10px]">{label}</Badge>;
}

export function BgpPeerDrilldownView({ data, loading, error }: BgpPeerDrilldownViewProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Erro ao carregar drilldown</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Selecione device + peer e clique em Consultar.
      </div>
    );
  }

  if (data.configBuildSource === "unknown" && data.rawEvidenceRefs.length === 0) {
    return (
      <div className="space-y-4">
        <BgpPeerDrilldownSafetyBanner />
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Snapshot sem raw_config utilizável</AlertTitle>
          <AlertDescription>
            Não há evidência raw_config suficiente para montar o drilldown completo a partir do snapshot salvo.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const unknownDeps = data.dependencies.filter((d) => d.status === "UNKNOWN");
  const missingDeps = data.dependencies.filter((d) => d.status === "MISSING");
  const routeTables = [
    ["received-routes", false],
    ["accepted-routes", false],
    ["advertised-routes", false],
  ] as const;

  return (
    <div className="space-y-4">
      <BgpPeerDrilldownSafetyBanner />
      <BgpDrilldownCacheStatusBanner cache={data.cache} configBuildSource={data.configBuildSource} />

      {/* Resumo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo do peer</CardTitle>
          <CardDescription>
            {data.peer} · device #{data.deviceId} · {new Date(data.collectedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          <ConfigSourceBadge source="snapshot" />
          <ConfigSourceBadge source={data.configBuildSource} />
          {data.snapshotId ? <Badge variant="outline">snapshot #{data.snapshotId}</Badge> : null}
          <DependencyStatusBadge status={data.root.status} />
        </CardContent>
      </Card>

      {/* Root */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Root config</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><dt className="text-muted-foreground">Peer</dt><dd className="font-mono">{data.root.peer}</dd></div>
            <div><dt className="text-muted-foreground">AS</dt><dd>{data.root.asNumber ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Description</dt><dd>{data.root.description ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Group</dt><dd className="font-mono">{data.root.group ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Connect IF</dt><dd className="font-mono">{data.root.connectInterface ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Source/evidence</dt><dd className="font-mono">{data.configBuildSource}</dd></div>
          </dl>
          {data.root.status === "MISSING" ? (
            <Alert className="mt-4 border-amber-500/30 bg-amber-500/5">
              <Info className="h-4 w-4 text-amber-400" />
              <AlertTitle>Peer não encontrado no snapshot</AlertTitle>
              <AlertDescription>Endpoint respondeu sem root config FOUND para este peer/device.</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {/* Families */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Address families</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>AFI/SAFI</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Import</TableHead>
                <TableHead>Export</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead>Herança</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.families.length ? data.families.map((f) => (
                <TableRow key={`${f.afiSafi}-${f.vrf ?? "global"}`}>
                  <TableCell><AfiSafiBadge afi={f.afiSafi} /></TableCell>
                  <TableCell>{f.enabled ? "yes" : "no"}</TableCell>
                  <TableCell className="font-mono text-xs">{f.effectiveImportPolicy ?? f.importPolicy ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{f.effectiveExportPolicy ?? f.exportPolicy ?? "—"}</TableCell>
                  <TableCell className="flex flex-wrap gap-1">
                    <BoolBadge value={f.defaultRouteAdvertise} label="default-route-adv" />
                    <BoolBadge value={f.nextHopLocal || f.effectiveNextHopLocal} label="next-hop-local" />
                    <BoolBadge value={f.advertiseCommunity} label="adv-community" />
                    <BoolBadge value={f.advertiseExtCommunity} label="adv-ext-community" />
                    <BoolBadge value={f.reflectClient} label="reflect-client" />
                  </TableCell>
                  <TableCell>
                    {f.inheritedFromGroup ? (
                      <span className="flex items-center gap-1 text-xs">
                        <PolicySourceBadge source="peer_group" inherited />
                        <span className="font-mono">{f.inheritedGroup}</span>
                      </span>
                    ) : (
                      <PolicySourceBadge source="peer" />
                    )}
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    Nenhuma address-family habilitada ou encontrada para este peer no snapshot.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Effective policies */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Effective policies</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>AFI</TableHead>
                <TableHead>Dir</TableHead>
                <TableHead>Policy</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.effectivePolicies.length ? data.effectivePolicies.map((p) => (
                <TableRow key={`${p.afiSafi}-${p.direction}-${p.policyName}`}>
                  <TableCell><AfiSafiBadge afi={p.afiSafi} /></TableCell>
                  <TableCell className="uppercase text-xs">{p.direction}</TableCell>
                  <TableCell className="font-mono text-xs">{p.policyName}</TableCell>
                  <TableCell>
                    <PolicySourceBadge source={p.source} inherited={p.inheritedFromGroup} />
                    {p.inheritedGroup ? <span className="ml-1 text-[10px] text-muted-foreground">{p.inheritedGroup}</span> : null}
                  </TableCell>
                  <TableCell><DependencyStatusBadge status={p.status} /></TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    Sem policies efetivas para este peer. Pode ser peer sem import/export ou catálogo ausente.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Policy trees */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import policy tree</CardTitle>
          </CardHeader>
          <CardContent>
            <BgpPolicyTree data={data} direction="import" title="Import" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Export policy tree</CardTitle>
          </CardHeader>
          <CardContent>
            <BgpPolicyTree data={data} direction="export" title="Export" />
          </CardContent>
        </Card>
      </div>

      {/* Policy detail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Policies detail</CardTitle>
          <CardDescription>Route-policy nodes, if-match/apply e status das dependências.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.policies.length ? data.policies.map((policy) => (
            <div key={`${policy.direction}-${policy.afiSafi}-${policy.name}`} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{policy.name}</span>
                <Badge variant="outline" className="uppercase text-[10px]">{policy.direction}</Badge>
                <AfiSafiBadge afi={policy.afiSafi} />
                <DependencyStatusBadge status={policy.status} />
              </div>
              <div className="mt-3 space-y-3">
                {policy.nodes.length ? policy.nodes.map((node) => (
                  <div key={`${policy.name}-${node.sequence ?? "node"}`} className="rounded border border-border/70 bg-muted/20 p-3 text-xs">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono">node {node.sequence ?? "?"}</span>
                      <Badge variant="outline" className="uppercase text-[10px]">{node.action ?? "unknown"}</Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="mb-1 text-muted-foreground">if-match</div>
                        {node.matches.length ? node.matches.map((match) => (
                          <div key={match.raw} className="flex flex-wrap items-center gap-2 font-mono">
                            <span>{match.type}</span>
                            <span>{match.name}</span>
                            {policy.dependencies
                              .filter((d) => d.dependencyType === match.type && d.dependencyName === match.name)
                              .map((d) => <DependencyStatusBadge key={`${d.dependencyType}-${d.dependencyName}`} status={d.status} />)}
                          </div>
                        )) : <div className="text-muted-foreground">—</div>}
                      </div>
                      <div>
                        <div className="mb-1 text-muted-foreground">apply</div>
                        {node.applies.length ? node.applies.map((apply) => (
                          <div key={apply.raw} className="font-mono">{apply.raw}</div>
                        )) : <div className="text-muted-foreground">—</div>}
                      </div>
                    </div>
                  </div>
                )) : <p className="text-sm text-muted-foreground">Policy sem nodes detalhados no snapshot.</p>}
              </div>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">Sem policies detalhadas retornadas pelo endpoint D2.</p>
          )}
        </CardContent>
      </Card>

      {/* Dependencies */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" />
            Dependencies
          </CardTitle>
          <CardDescription>{data.dependencies.length} arestas no grafo flatten</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto max-h-80">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.dependencies.map((d, i) => (
                <TableRow key={`${d.fromName}-${d.dependencyType}-${d.dependencyName}-${i}`}>
                  <TableCell className="font-mono text-xs">{d.fromName}</TableCell>
                  <TableCell className="text-xs">{d.dependencyType}</TableCell>
                  <TableCell className="font-mono text-xs">{d.dependencyName}</TableCell>
                  <TableCell><DependencyStatusBadge status={d.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Route tables */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Route tables</CardTitle>
          <CardDescription>Consultas de rotas são comandos pesados e serão tratadas em fase futura com confirmação.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {routeTables.map(([name]) => (
            <div key={name} className="rounded-md border border-dashed border-border p-3">
              <div className="font-mono text-sm">{name}</div>
              <Badge variant="outline" className="mt-2 bg-slate-500/10 text-slate-300 border-slate-500/20">
                not requested
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Warnings */}
      {(data.warnings.length > 0 || unknownDeps.length > 0 || missingDeps.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4" />
              Warnings / UNKNOWN
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.warnings.map((w) => (
              <p key={w} className="text-amber-200/90">{w}</p>
            ))}
            {unknownDeps.length > 0 ? (
              <p className="text-muted-foreground">{unknownDeps.length} dependência(s) UNKNOWN (catálogo vazio — não é FAIL).</p>
            ) : null}
            {missingDeps.length > 0 ? (
              <p className="text-red-300/90">{missingDeps.length} dependência(s) MISSING no snapshot.</p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Evidence */}
      {data.rawEvidenceRefs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Raw evidence refs</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-xs font-mono space-y-1 text-muted-foreground">
              {data.rawEvidenceRefs.map((ref, i) => (
                <li key={i}>
                  {ref.commandOrScope} · {ref.source} · {new Date(ref.collectedAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

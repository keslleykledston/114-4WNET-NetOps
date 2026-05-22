import type { ComplianceFinding, ComplianceFindingGroup } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { OperationalCategoryBadge } from "./operational-category-badge";

function findingMessage(finding: ComplianceFinding) {
  return finding.message ?? finding.detail ?? "Sem mensagem normalizada";
}

function findingRuleId(finding: ComplianceFinding) {
  return finding.ruleId ?? finding.policyName ?? "unknown";
}

export function findingBelongsToGroup(finding: ComplianceFinding, group: ComplianceFindingGroup) {
  return findingRuleId(finding) === group.ruleId &&
    finding.context === group.context &&
    finding.severity === group.severity &&
    (finding.operationalCategory ?? "unknown") === group.operationalCategory &&
    findingMessage(finding) === group.message;
}

interface ComplianceFindingGroupDrawerProps {
  group: ComplianceFindingGroup | null;
  findings: ComplianceFinding[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badgeClass: (value: string | null | undefined) => string;
}

export function ComplianceFindingGroupDrawer({
  group,
  findings,
  open,
  onOpenChange,
  badgeClass,
}: ComplianceFindingGroupDrawerProps) {
  const groupFindings = group ? findings.filter((finding) => findingBelongsToGroup(finding, group)) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="pr-8">
          <SheetTitle>Grupo de findings</SheetTitle>
          <SheetDescription>
            Findings agregados por regra, contexto, severidade e categoria operacional.
          </SheetDescription>
        </SheetHeader>

        {group && (
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div>
                <div className="text-muted-foreground">Rule ID</div>
                <div className="font-mono text-xs">{group.ruleId}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Context</div>
                <div className="font-mono text-xs">{group.context}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Severity</div>
                <Badge variant="outline" className={badgeClass(group.severity)}>{group.severity}</Badge>
              </div>
              <div>
                <div className="text-muted-foreground">Count</div>
                <div className="text-lg font-semibold">{group.count}</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Categoria operacional</div>
              <OperationalCategoryBadge value={group.operationalCategory} />
            </div>

            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Mensagem normalizada</div>
              <div className="text-sm">{group.message}</div>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Sample finding IDs</div>
              <div className="flex flex-wrap gap-1">
                {group.sampleFindingIds.map((id) => (
                  <Badge key={id} variant="secondary" className="font-mono text-[10px]">#{id}</Badge>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="text-sm font-medium">Findings do grupo</div>
              {groupFindings.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Nenhum finding carregado para este grupo com os filtros atuais.
                </div>
              ) : groupFindings.map((finding) => (
                <div key={finding.id} className="rounded-md border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">#{finding.id}</div>
                      <div className="mt-1 text-sm font-medium">{findingMessage(finding)}</div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className={badgeClass(finding.status ?? finding.result)}>{finding.status ?? finding.result}</Badge>
                      <Badge variant="outline" className={badgeClass(finding.confidence)}>{finding.confidence ?? "-"}</Badge>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 text-xs md:grid-cols-3">
                    <div>
                      <div className="text-muted-foreground">Objeto afetado</div>
                      <div>{finding.objectName ?? finding.deviceHostname ?? "-"}</div>
                      <div className="text-muted-foreground">{finding.objectType ?? "device"} / {finding.objectId ?? "-"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Source</div>
                      <div className="font-mono">{finding.source ?? "-"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Recommendation</div>
                      <div>{finding.recommendation ?? "-"}</div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-md bg-muted p-3">
                    <div className="mb-1 text-xs text-muted-foreground">Evidência individual</div>
                    <pre className="whitespace-pre-wrap text-xs">{finding.evidence ?? "Sem evidence sanitizada"}</pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

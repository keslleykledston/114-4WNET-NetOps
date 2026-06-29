import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTranslation } from "@/i18n";
import { useL2Circuit, type L2Circuit, type L2Finding } from "./l2-circuits-api";
import {
  CircuitTypeBadge,
  FindingSeverityBadge,
  OperStatusBadge,
  circuitTypeGroup,
} from "./l2-circuit-badges";
import {
  formatDeviceLabel,
  formatVlanVcVsiSummary,
  friendlyOperStatus,
  getCircuitDisplayName,
  getDetailHeaderBadges,
  getFriendlyFindingCopy,
  getProbableCause,
  getProbableImpact,
  getSuggestedActionSteps,
  type DetailNocBadge,
} from "./l2-circuit-detail-noc";
import { formatTs } from "./l2-circuits-utils";

const ds = "l2Circuits.detailSheet";

function FieldBlock({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</div>
    </div>
  );
}

function OptionalField({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value == null || value === "") return null;
  return <FieldBlock label={label} value={String(value)} mono={mono} />;
}

function SeverityBadge({ kind }: { kind: DetailNocBadge }) {
  const { t } = useTranslation();
  const label = t(`${ds}.severityBadges.${kind}`);
  const cls =
    kind === "critical"
      ? "bg-red-500/10 text-red-400 border-red-500/20"
      : kind === "unavailable"
        ? "bg-red-500/10 text-red-300 border-red-500/20"
        : kind === "attention"
          ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
          : "bg-blue-500/10 text-blue-300 border-blue-500/20";
  return (
    <Badge variant="outline" className={cls}>
      {label}
    </Badge>
  );
}

function TechnicalDetailFields({ circuit }: { circuit: L2Circuit }) {
  const { t } = useTranslation();
  const group = circuitTypeGroup(circuit.circuitType);

  return (
    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <FieldBlock label={t(`${ds}.deviceId`)} value={String(circuit.deviceId)} />
      <FieldBlock label={t(`${ds}.serviceId`)} value={circuit.serviceId ?? "—"} mono />
      <OptionalField label={t(`${ds}.name`)} value={circuit.name} />
      <OptionalField label={t(`${ds}.descriptionField`)} value={circuit.description} />
      <OptionalField label={t(`${ds}.localInterface`)} value={circuit.localInterface} mono />
      <OptionalField label={t(`${ds}.classification`)} value={circuit.classification} />
      <OptionalField label={t(`${ds}.l2Transport`)} value={circuit.l2Transport} />
      <OptionalField label={t(`${ds}.parentInterface`)} value={circuit.parentInterface} mono />
      {(group === "local" || group === "mpls") && <OptionalField label={t(`${ds}.outerVlan`)} value={circuit.outerVlan} />}
      {group === "local" && <OptionalField label={t(`${ds}.innerVlan`)} value={circuit.innerVlan} />}
      {group === "mpls" && <OptionalField label={t(`${ds}.vcId`)} value={circuit.vcId} />}
      {group === "mpls" && <OptionalField label={t(`${ds}.peerIp`)} value={circuit.peerIp} />}
      {group === "vsi" && <OptionalField label={t(`${ds}.vsiName`)} value={circuit.vsiName} />}
      {group === "vsi" && <OptionalField label={t(`${ds}.vsiId`)} value={circuit.vsiId} />}
      {group === "vsi" && <OptionalField label={t(`${ds}.peerIp`)} value={circuit.peerIp} />}
      <FieldBlock label={t(`${ds}.adminStatus`)} value={circuit.adminStatus} />
      <FieldBlock label={t(`${ds}.operStatus`)} value={circuit.operStatus} />
      <OptionalField label={t(`${ds}.pwStatus`)} value={circuit.pwStatus} />
      <FieldBlock label={t(`${ds}.source`)} value={circuit.source} />
      <div className="sm:col-span-2">
        <FieldBlock label={t(`${ds}.discoveryRun`)} value={circuit.discoveryRunId} mono />
      </div>
      <FieldBlock label={t(`${ds}.firstSeen`)} value={formatTs(circuit.firstSeen)} />
      <FieldBlock label={t(`${ds}.lastSeen`)} value={formatTs(circuit.lastSeen)} />
      <L3RoleContextFields roleContext={circuit.roleContext} />
      {circuit.anomalyTags?.length ? (
        <div className="sm:col-span-2">
          <FieldBlock label={t(`${ds}.anomalyTags`)} value={circuit.anomalyTags.join(", ")} mono />
        </div>
      ) : null}
    </div>
  );
}

function L3RoleContextFields({ roleContext }: { roleContext?: string | null }) {
  const { t } = useTranslation();
  if (!roleContext) return null;
  try {
    const parsed = JSON.parse(roleContext) as Record<string, unknown>;
    if (parsed.service_family !== "l3") return null;
    const parts = [
      parsed.encapsulation ? `encap=${String(parsed.encapsulation)}` : null,
      parsed.ipv4 ? "IPv4" : null,
      parsed.ipv6 ? "IPv6" : null,
      parsed.ospf ? "OSPF" : null,
      parsed.isis ? "ISIS" : null,
      parsed.bgp ? "BGP" : null,
      parsed.vrf ? "VRF" : null,
    ].filter(Boolean);
    if (!parts.length) return null;
    return (
      <div className="sm:col-span-2">
        <FieldBlock label={t(`${ds}.l3ServiceContext`)} value={parts.join(" · ")} />
      </div>
    );
  } catch {
    return null;
  }
}

function SummaryCard({ circuit, deviceName }: { circuit: L2Circuit; deviceName?: string | null }) {
  const { t } = useTranslation();
  const rows = [
    { label: t(`${ds}.summary.status`), value: friendlyOperStatus(circuit.operStatus, t) },
    { label: t(`${ds}.summary.service`), value: getCircuitDisplayName(circuit) },
    { label: t(`${ds}.summary.identifier`), value: formatVlanVcVsiSummary(circuit, t) },
    { label: t(`${ds}.summary.device`), value: formatDeviceLabel(circuit, deviceName) },
    { label: t(`${ds}.summary.lastCheck`), value: formatTs(circuit.lastSeen) },
    { label: t(`${ds}.summary.impact`), value: getProbableImpact(circuit, t) },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t(`${ds}.summary.title`)}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="text-xs text-muted-foreground">{row.label}</div>
            <div className="text-sm font-medium">{row.value}</div>
          </div>
        ))}
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2 pt-1">
          <CircuitTypeBadge type={circuit.circuitType} />
          <OperStatusBadge status={circuit.operStatus} />
          <Badge variant="secondary">#{circuit.id}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function ProblemsCard({ findings }: { findings: L2Finding[] }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t(`${ds}.problems.title`, { count: findings.length })}</CardTitle>
      </CardHeader>
      <CardContent>
        {findings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t(`${ds}.problems.none`)}</p>
        ) : (
          <ul className="space-y-3">
            {findings.map((finding, index) => {
              const copy = getFriendlyFindingCopy(finding, t);
              return (
                <li key={`${finding.code}-${index}`} className="rounded-md border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{copy.title}</p>
                    <FindingSeverityBadge severity={finding.severity} />
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t(`${ds}.problems.explanation`)}</dt>
                      <dd>{copy.explanation}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t(`${ds}.problems.impact`)}</dt>
                      <dd>{copy.impact}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t(`${ds}.problems.suggestedAction`)}</dt>
                      <dd>{copy.action}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ActionsCard({ circuit }: { circuit: L2Circuit }) {
  const { t } = useTranslation();
  const steps = getSuggestedActionSteps(circuit, t);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t(`${ds}.actions.title`)}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function TechnicalFindingsBlock({ findings }: { findings: L2Finding[] }) {
  const { t } = useTranslation();

  if (!findings.length) {
    return <p className="text-sm text-muted-foreground">{t(`${ds}.noFindings`)}</p>;
  }

  return (
    <ul className="space-y-2">
      {findings.map((finding, index) => (
        <li key={`${finding.code}-tech-${index}`} className="rounded-md border p-3 text-sm">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              {finding.code}
            </Badge>
            <FindingSeverityBadge severity={finding.severity} />
          </div>
          <p className="text-muted-foreground">{finding.message}</p>
        </li>
      ))}
    </ul>
  );
}

interface L2CircuitDetailSheetProps {
  circuitId: number | null;
  fallback?: L2Circuit | null;
  deviceName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function L2CircuitDetailSheet({
  circuitId,
  fallback,
  deviceName,
  open,
  onOpenChange,
}: L2CircuitDetailSheetProps) {
  const { t } = useTranslation();
  const { data: fetched, isLoading, isError, error } = useL2Circuit(open ? circuitId : null);
  const circuit = fetched ?? fallback ?? null;

  const headerTitle = circuit
    ? t(`${ds}.headerTitle`, {
        name: getCircuitDisplayName(circuit),
        status: friendlyOperStatus(circuit.operStatus, t),
      })
    : t(`${ds}.title`);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="space-y-3 pr-8 text-left">
          <div className="flex flex-wrap items-center gap-2">
            {circuit ? getDetailHeaderBadges(circuit).map((badge) => <SeverityBadge key={badge} kind={badge} />) : null}
          </div>
          <SheetTitle className="text-xl leading-snug">{headerTitle}</SheetTitle>
          <SheetDescription className="text-sm leading-relaxed">
            {circuit ? getProbableCause(circuit, t) : t(`${ds}.description`)}
          </SheetDescription>
        </SheetHeader>

        {isLoading && !circuit && <p className="mt-6 text-sm text-muted-foreground">{t(`${ds}.loading`)}</p>}
        {isError && !circuit && (
          <p className="mt-6 text-sm text-destructive">{error instanceof Error ? error.message : t(`${ds}.loadFailed`)}</p>
        )}

        {circuit && (
          <div className="mt-6 space-y-4">
            <SummaryCard circuit={circuit} deviceName={deviceName} />
            <ProblemsCard findings={circuit.findings} />
            <ActionsCard circuit={circuit} />

            <Accordion type="single" collapsible className="rounded-md border px-4">
              <AccordionItem value="technical" className="border-none">
                <AccordionTrigger className="py-3 hover:no-underline">
                  {t(`${ds}.technical.title`)}
                </AccordionTrigger>
                <AccordionContent className="space-y-5 pb-2">
                  <TechnicalDetailFields circuit={circuit} />

                  <Section title={t(`${ds}.technical.findingsOriginal`)}>
                    <TechnicalFindingsBlock findings={circuit.findings} />
                  </Section>

                  <Section title={t(`${ds}.rawEvidence`)}>
                    <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap break-all">
                      {circuit.rawEvidence?.trim() || t(`${ds}.noEvidence`)}
                    </pre>
                  </Section>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

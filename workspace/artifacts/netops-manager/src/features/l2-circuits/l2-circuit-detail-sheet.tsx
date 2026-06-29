import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTranslation } from "@/i18n";
import { useL2Circuit, type L2Circuit } from "./l2-circuits-api";
import {
  CircuitTypeBadge,
  FindingSeverityBadge,
  OperStatusBadge,
  circuitTypeGroup,
} from "./l2-circuit-badges";

function formatTs(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function FieldBlock({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-medium ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</div>
    </div>
  );
}

function OptionalField({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return <FieldBlock label={label} value={String(value)} />;
}

function DetailFields({ circuit }: { circuit: L2Circuit }) {
  const { t } = useTranslation();
  const group = circuitTypeGroup(circuit.circuitType);
  const ds = "l2Circuits.detailSheet";

  return (
    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
      <FieldBlock label={t(`${ds}.deviceId`)} value={String(circuit.deviceId)} />
      <FieldBlock label={t(`${ds}.serviceId`)} value={circuit.serviceId ?? "—"} mono />
      <OptionalField label={t(`${ds}.name`)} value={circuit.name} />
      <OptionalField label={t(`${ds}.descriptionField`)} value={circuit.description} />
      <OptionalField label={t(`${ds}.classification`)} value={circuit.classification} />
      <OptionalField label={t(`${ds}.l2Transport`)} value={circuit.l2Transport} />
      <OptionalField label={t(`${ds}.parentInterface`)} value={circuit.parentInterface} />
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
      <div className="col-span-2 md:col-span-3">
        <FieldBlock label={t(`${ds}.discoveryRun`)} value={circuit.discoveryRunId} mono />
      </div>
      <FieldBlock label={t(`${ds}.firstSeen`)} value={formatTs(circuit.firstSeen)} />
      <FieldBlock label={t(`${ds}.lastSeen`)} value={formatTs(circuit.lastSeen)} />
      <L3RoleContextFields roleContext={circuit.roleContext} />
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
      <div className="col-span-2 md:col-span-3">
        <FieldBlock label={t("l2Circuits.detailSheet.l3ServiceContext")} value={parts.join(" · ")} />
      </div>
    );
  } catch {
    return null;
  }
}

interface L2CircuitDetailSheetProps {
  circuitId: number | null;
  fallback?: L2Circuit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function L2CircuitDetailSheet({ circuitId, fallback, open, onOpenChange }: L2CircuitDetailSheetProps) {
  const { t } = useTranslation();
  const { data: fetched, isLoading, isError, error } = useL2Circuit(open ? circuitId : null);
  const circuit = fetched ?? fallback ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="pr-8">
          <SheetTitle>{t("l2Circuits.detailSheet.title")}</SheetTitle>
          <SheetDescription>{t("l2Circuits.detailSheet.description")}</SheetDescription>
        </SheetHeader>

        {isLoading && !circuit && <p className="mt-6 text-sm text-muted-foreground">{t("l2Circuits.detailSheet.loading")}</p>}
        {isError && !circuit && (
          <p className="mt-6 text-sm text-destructive">{error instanceof Error ? error.message : t("l2Circuits.detailSheet.loadFailed")}</p>
        )}

        {circuit && (
          <div className="mt-6 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <CircuitTypeBadge type={circuit.circuitType} />
              <OperStatusBadge status={circuit.operStatus} />
              <Badge variant="secondary">#{circuit.id}</Badge>
            </div>

            <DetailFields circuit={circuit} />

            <Separator />

            <Section title={t("l2Circuits.detailSheet.findingsTitle", { count: circuit.findings.length })}>
              {circuit.findings.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("l2Circuits.detailSheet.noFindings")}</p>
              ) : (
                <ul className="space-y-2">
                  {circuit.findings.map((finding, idx) => (
                    <li key={`${finding.code}-${idx}`} className="rounded-md border p-3 text-sm">
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
              )}
            </Section>

            <Separator />

            <Section title={t("l2Circuits.detailSheet.rawEvidence")}>
              <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap break-all">
                {circuit.rawEvidence?.trim() || t("l2Circuits.detailSheet.noEvidence")}
              </pre>
            </Section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

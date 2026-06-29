import type { Device, NetopsBgpPeer } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ArrowLeftRight, GitBranch, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";

interface BgpPeerContextCardProps {
  device: Device | null;
  peer: NetopsBgpPeer | null;
  drilldownHref: string;
  netopsHref: string;
  operationalHref: string;
  onEditPolicy?: () => void;
  className?: string;
}

function labelOrDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function roleLabel(role: string | null | undefined, t: (key: string) => string): string {
  if (!role) return "—";
  const key = `bgp.roleLabels.${role}`;
  const translated = t(key);
  return translated === key ? role : translated;
}

export function BgpPeerContextCard({
  device,
  peer,
  drilldownHref,
  netopsHref,
  operationalHref,
  onEditPolicy,
  className,
}: BgpPeerContextCardProps) {
  const { t } = useTranslation();

  const deviceLabel = device?.hostname
    ?? (device?.id != null ? t("bgp.peerContext.deviceFallback", { id: device.id }) : "—");

  return (
    <Card className={cn("border-border/70 bg-card/80", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("bgp.peerContext.title")}</CardTitle>
            <div className="mt-1 text-sm text-muted-foreground">{t("bgp.peerContext.subtitle")}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={operationalHref}>
                <ArrowLeftRight className="h-4 w-4" />
                {t("bgp.peerContext.bgpOperations")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={netopsHref}>
                <Workflow className="h-4 w-4" />
                {t("bgp.peerContext.netopsOperations")}
              </Link>
            </Button>
            <Button asChild variant="default" size="sm">
              <Link href={drilldownHref}>
                <GitBranch className="h-4 w-4" />
                {t("bgp.peerContext.bgpDrilldown")}
              </Link>
            </Button>
            {onEditPolicy ? (
              <Button variant="secondary" size="sm" onClick={onEditPolicy}>
                {t("bgp.peerContext.editPolicy")}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InfoTile label={t("bgp.peerContext.device")} value={deviceLabel} mono={false} />
        <InfoTile label={t("bgp.peerContext.peerIp")} value={peer?.peerIp ?? "—"} mono />
        <InfoTile label={t("bgp.peerContext.remoteAsn")} value={peer?.remoteAs ?? "—"} mono />
        <InfoTile label={t("bgp.peerContext.vrf")} value={labelOrDash(peer?.vrf)} mono />
        <InfoTile label={t("bgp.peerContext.role")} value={roleLabel(peer?.role, t)} />
        <InfoTile label={t("bgp.peerContext.state")} value={labelOrDash(peer?.state)} />
        <InfoTile label={t("bgp.peerContext.importPolicy")} value={labelOrDash(peer?.importPolicy)} mono />
        <InfoTile label={t("bgp.peerContext.exportPolicy")} value={labelOrDash(peer?.exportPolicy)} mono />
      </CardContent>
    </Card>
  );
}

function InfoTile({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-sm font-medium", mono && "font-mono text-xs break-all")}>{value}</div>
    </div>
  );
}

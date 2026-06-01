import type { Device, NetopsBgpPeer } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ArrowLeftRight, GitBranch, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface BgpPeerContextCardProps {
  device: Device | null;
  peer: NetopsBgpPeer | null;
  drilldownHref: string;
  netopsHref: string;
  operationalHref: string;
  className?: string;
}

function labelOrDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function BgpPeerContextCard({
  device,
  peer,
  drilldownHref,
  netopsHref,
  operationalHref,
  className,
}: BgpPeerContextCardProps) {
  return (
    <Card className={cn("border-border/70 bg-card/80", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">BGP Peer Context</CardTitle>
            <div className="mt-1 text-sm text-muted-foreground">
              Ponte entre cockpit, operations e drilldown.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={operationalHref}>
                <ArrowLeftRight className="h-4 w-4" />
                BGP Operations
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={netopsHref}>
                <Workflow className="h-4 w-4" />
                NetOps Operations
              </Link>
            </Button>
            <Button asChild variant="default" size="sm">
              <Link href={drilldownHref}>
                <GitBranch className="h-4 w-4" />
                BGP Drilldown
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InfoTile label="Device" value={device?.hostname ?? `Device #${device?.id ?? "—"}`} mono={false} />
        <InfoTile label="Peer IP" value={peer?.peerIp ?? "—"} mono />
        <InfoTile label="ASN remoto" value={peer?.remoteAs ?? "—"} mono />
        <InfoTile label="VRF" value={labelOrDash(peer?.vrf)} mono />
        <InfoTile label="Role" value={labelOrDash(peer?.role)} />
        <InfoTile label="State" value={labelOrDash(peer?.state)} />
        <InfoTile label="Import policy" value={labelOrDash(peer?.importPolicy)} mono />
        <InfoTile label="Export policy" value={labelOrDash(peer?.exportPolicy)} mono />
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

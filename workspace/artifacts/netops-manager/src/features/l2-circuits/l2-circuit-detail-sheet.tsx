import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useL2Circuit, type L2Circuit, type L2VsiPeer } from "./l2-circuits-api";
import {
  CircuitTypeBadge,
  FindingSeverityBadge,
  OperStatusBadge,
  circuitTypeGroup,
  operStatusClass,
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
  const group = circuitTypeGroup(circuit.circuitType);

  return (
    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
      <FieldBlock label="Device ID" value={String(circuit.deviceId)} />
      <FieldBlock label="Service ID" value={circuit.serviceId ?? "—"} mono />
      <OptionalField label="Name" value={circuit.name} />
      <OptionalField label="Description" value={circuit.description} />
      <OptionalField label="Classification" value={circuit.classification} />
      <OptionalField label="L2 transport" value={circuit.l2Transport} />
      <OptionalField label="Parent interface" value={circuit.parentInterface} />
      {(group === "local" || group === "mpls") && <OptionalField label="Outer VLAN" value={circuit.outerVlan} />}
      {group === "local" && <OptionalField label="Inner VLAN" value={circuit.innerVlan} />}
      {group === "mpls" && <OptionalField label="VC ID" value={circuit.vcId} />}
      {group === "mpls" && <OptionalField label="Peer IP" value={circuit.peerIp} />}
      {group === "vsi" && <OptionalField label="VSI name" value={circuit.vsiName} />}
      {group === "vsi" && <OptionalField label="VSI ID" value={circuit.vsiId} />}
      {group === "vsi" && <OptionalField label="Primary peer IP" value={circuit.primaryPeerIp ?? circuit.peerIp} />}
      {group === "vsi" && circuit.peerIps && circuit.peerIps.length > 1 && (
        <div className="col-span-2 md:col-span-3">
          <FieldBlock label="Peer IPs" value={circuit.peerIps.join(", ")} mono />
        </div>
      )}
      {group === "vsi" && circuit.pwSummary && (
        <>
          <FieldBlock label="PW total" value={String(circuit.pwSummary.total)} />
          <FieldBlock label="PW up" value={String(circuit.pwSummary.up)} />
          <FieldBlock label="PW down" value={String(circuit.pwSummary.down)} />
        </>
      )}
      <FieldBlock label="Admin status" value={circuit.adminStatus} />
      <FieldBlock label="Oper status" value={circuit.operStatus} />
      <OptionalField label="PW status" value={circuit.pwStatus} />
      <FieldBlock label="Source" value={circuit.source} />
      <div className="col-span-2 md:col-span-3">
        <FieldBlock label="Discovery run" value={circuit.discoveryRunId} mono />
      </div>
      <FieldBlock label="First seen" value={formatTs(circuit.firstSeen)} />
      <FieldBlock label="Last seen" value={formatTs(circuit.lastSeen)} />
      <L3RoleContextFields roleContext={circuit.roleContext} />
    </div>
  );
}

function L3RoleContextFields({ roleContext }: { roleContext?: string | null }) {
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
        <FieldBlock label="L3 service context" value={parts.join(" · ")} />
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
  const { data: fetched, isLoading, isError, error } = useL2Circuit(open ? circuitId : null);
  const circuit = fetched ?? fallback ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="pr-8">
          <SheetTitle>L2 Circuit Detail</SheetTitle>
          <SheetDescription>Read-only view — evidence redacted at collection time.</SheetDescription>
        </SheetHeader>

        {isLoading && !circuit && <p className="mt-6 text-sm text-muted-foreground">Loading...</p>}
        {isError && !circuit && (
          <p className="mt-6 text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load circuit"}</p>
        )}

        {circuit && (
          <div className="mt-6 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <CircuitTypeBadge type={circuit.circuitType} />
              <OperStatusBadge status={circuit.operStatus} />
              <Badge variant="secondary">#{circuit.id}</Badge>
            </div>

            <DetailFields circuit={circuit} />

            {circuitTypeGroup(circuit.circuitType) === "vsi" && (circuit.peers?.length ?? 0) > 0 && (
              <>
                <Separator />
                <VsiPeersSection peers={circuit.peers ?? []} />
              </>
            )}

            <Separator />

            <Section title={`Findings (${circuit.findings.length})`}>
              {circuit.findings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No findings</p>
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

            <Section title="Raw evidence (redacted)">
              <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap break-all">
                {circuit.rawEvidence?.trim() || "No evidence stored"}
              </pre>
            </Section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function peerStateBadge(state?: string) {
  const normalized = (state ?? "unknown").toUpperCase();
  if (normalized === "UP") {
    return <Badge className={operStatusClass("UP")}>UP</Badge>;
  }
  if (normalized === "DOWN") {
    return <Badge className={operStatusClass("DOWN")}>DOWN</Badge>;
  }
  return <Badge className={operStatusClass("UNKNOWN")}>UNKNOWN</Badge>;
}

function VsiPeersSection({ peers }: { peers: L2VsiPeer[] }) {
  return (
    <Section title="Pseudowires / Peers">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Peer IP</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>PW State</TableHead>
              <TableHead className="hidden md:table-cell">Tunnel ID</TableHead>
              <TableHead className="hidden lg:table-cell">Out Interface</TableHead>
              <TableHead className="hidden xl:table-cell">Last Up</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {peers.map((peer) => (
              <TableRow key={peer.peer_ip}>
                <TableCell className="font-mono text-xs">
                  {peer.peer_ip}
                  {peer.primary ? (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      primary
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>{peerStateBadge(peer.session_state)}</TableCell>
                <TableCell>{peerStateBadge(peer.pw_state ?? peer.session_state)}</TableCell>
                <TableCell className="hidden md:table-cell font-mono text-xs">{peer.tunnel_id ?? "—"}</TableCell>
                <TableCell className="hidden lg:table-cell font-mono text-xs">{peer.out_interface ?? "—"}</TableCell>
                <TableCell className="hidden xl:table-cell text-xs">{peer.last_up_time ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Section>
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

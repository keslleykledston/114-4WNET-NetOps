import {
  getGetNetopsDeviceBgpPeerCommunitiesQueryKey,
  getGetNetopsDeviceBgpPeerDiagnosticsQueryKey,
  getGetNetopsDeviceBgpPeerPoliciesQueryKey,
  getGetNetopsDeviceBgpPeerQueryKey,
  getListNetopsDeviceBgpPeerAdvertisedPrefixesQueryKey,
  getListNetopsDeviceBgpPeerReceivedPrefixesQueryKey,
  useGetNetopsDeviceBgpPeer,
  useGetNetopsDeviceBgpPeerCommunities,
  useGetNetopsDeviceBgpPeerDiagnostics,
  useGetNetopsDeviceBgpPeerPolicies,
  useListNetopsDeviceBgpPeerAdvertisedPrefixes,
  useListNetopsDeviceBgpPeerReceivedPrefixes,
} from "@workspace/api-client-react";
import type {
  Device,
  NetopsBgpCommunities,
  NetopsBgpDiagnostics,
  NetopsBgpPeer,
  NetopsBgpPolicies,
  NetopsBgpPrefixEntry,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type BgpPeerActionKind =
  | "details"
  | "received"
  | "advertised"
  | "policies"
  | "communities"
  | "diagnostics";

const actionTitles: Record<BgpPeerActionKind, string> = {
  details: "Detalhes do peer",
  received: "Prefixos recebidos",
  advertised: "Prefixos exportados",
  policies: "Policies",
  communities: "Communities",
  diagnostics: "Diagnostico",
};

interface BgpPeerSheetProps {
  device: Device;
  peer: NetopsBgpPeer | null;
  action: BgpPeerActionKind | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BgpPeerSheet({ device, peer, action, open, onOpenChange }: BgpPeerSheetProps) {
  const peerIp = peer?.peerIp ?? "";
  const deviceId = device.id;
  const fetchEnabled = open && !!peer && !!action;

  const details = useGetNetopsDeviceBgpPeer(deviceId, peerIp, {
    query: {
      enabled: fetchEnabled && action === "details",
      queryKey: getGetNetopsDeviceBgpPeerQueryKey(deviceId, peerIp),
    },
  });
  const received = useListNetopsDeviceBgpPeerReceivedPrefixes(deviceId, peerIp, {
    query: {
      enabled: fetchEnabled && action === "received",
      queryKey: getListNetopsDeviceBgpPeerReceivedPrefixesQueryKey(deviceId, peerIp),
    },
  });
  const advertised = useListNetopsDeviceBgpPeerAdvertisedPrefixes(deviceId, peerIp, {
    query: {
      enabled: fetchEnabled && action === "advertised",
      queryKey: getListNetopsDeviceBgpPeerAdvertisedPrefixesQueryKey(deviceId, peerIp),
    },
  });
  const policies = useGetNetopsDeviceBgpPeerPolicies(deviceId, peerIp, {
    query: {
      enabled: fetchEnabled && action === "policies",
      queryKey: getGetNetopsDeviceBgpPeerPoliciesQueryKey(deviceId, peerIp),
    },
  });
  const communities = useGetNetopsDeviceBgpPeerCommunities(deviceId, peerIp, {
    query: {
      enabled: fetchEnabled && action === "communities",
      queryKey: getGetNetopsDeviceBgpPeerCommunitiesQueryKey(deviceId, peerIp),
    },
  });
  const diagnostics = useGetNetopsDeviceBgpPeerDiagnostics(deviceId, peerIp, {
    query: {
      enabled: fetchEnabled && action === "diagnostics",
      queryKey: getGetNetopsDeviceBgpPeerDiagnosticsQueryKey(deviceId, peerIp),
    },
  });

  const activeQuery = {
    details,
    received,
    advertised,
    policies,
    communities,
    diagnostics,
  }[action ?? "details"];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{action ? actionTitles[action] : "Peer BGP"}</SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {peer ? `${peer.peerIp} · ${peer.addressFamily} · AS ${peer.remoteAs ?? "-"}` : "Selecione um peer"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {!peer || !action ? null : activeQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : activeQuery.isError ? (
            <EmptyState message="Falha ao carregar dados read-only deste peer." />
          ) : (
            <ActionBody
              action={action}
              peer={peer}
              detailsData={details.data}
              receivedData={received.data}
              advertisedData={advertised.data}
              policiesData={policies.data}
              communitiesData={communities.data}
              diagnosticsData={diagnostics.data}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ActionBody({
  action,
  peer,
  detailsData,
  receivedData,
  advertisedData,
  policiesData,
  communitiesData,
  diagnosticsData,
}: {
  action: BgpPeerActionKind;
  peer: NetopsBgpPeer;
  detailsData?: NetopsBgpPeer;
  receivedData?: NetopsBgpPrefixEntry[];
  advertisedData?: NetopsBgpPrefixEntry[];
  policiesData?: NetopsBgpPolicies;
  communitiesData?: NetopsBgpCommunities;
  diagnosticsData?: NetopsBgpDiagnostics;
}) {
  switch (action) {
    case "details": {
      const data = detailsData ?? peer;
      return (
        <dl className="grid gap-3 text-sm">
          <DetailRow label="Peer IP" value={data.peerIp} mono />
          <DetailRow label="Nome" value={data.name ?? data.description ?? "-"} />
          <DetailRow label="ASN remoto" value={data.remoteAs?.toString() ?? "-"} />
          <DetailRow label="Estado" value={data.state} />
          <DetailRow label="Papel" value={`${data.role} (${data.roleSource})`} />
          <DetailRow label="Address family" value={data.addressFamily} />
          <DetailRow label="Sessao" value={data.sessionType} />
          <DetailRow label="VRF" value={data.vrf ?? "-"} />
          <DetailRow label="Import policy" value={data.importPolicy ?? "-"} />
          <DetailRow label="Export policy" value={data.exportPolicy ?? "-"} />
          <DetailRow label="Uptime" value={data.uptime ?? "-"} />
          <DetailRow label="Fonte" value={data.source} />
        </dl>
      );
    }
    case "received":
    case "advertised": {
      const rows = action === "received" ? receivedData : advertisedData;
      if (!rows?.length) {
        return <EmptyState message="Nenhum prefixo retornado (stub ou coleta futura)." />;
      }
      return <PrefixTable rows={rows} />;
    }
    case "policies": {
      if (!policiesData) return <EmptyState message="Policies indisponiveis." />;
      return (
        <div className="space-y-3 text-sm">
          <DetailRow label="Import" value={policiesData.importPolicy ?? "-"} />
          <DetailRow label="Export" value={policiesData.exportPolicy ?? "-"} />
          <p className="text-xs text-muted-foreground">{policiesData.message}</p>
          {!policiesData.filters.length ? (
            <EmptyState message="Nenhum filter associado." />
          ) : (
            <ul className="space-y-2">
              {policiesData.filters.map((filter) => (
                <li key={filter.name} className="rounded-md border px-3 py-2">
                  <div className="font-medium">{filter.name}</div>
                  <div className="text-xs text-muted-foreground">{filter.type} · {filter.source}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case "communities": {
      if (!communitiesData) return <EmptyState message="Communities indisponiveis." />;
      return (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">{communitiesData.message}</p>
          {!communitiesData.communities.length ? (
            <EmptyState message="Nenhuma community retornada." />
          ) : (
            <ul className="space-y-2">
              {communitiesData.communities.map((entry) => (
                <li key={entry.name} className="rounded-md border px-3 py-2">
                  <div className="font-medium">{entry.name}</div>
                  <div className="text-xs text-muted-foreground">{entry.type} · {entry.source}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case "diagnostics": {
      if (!diagnosticsData?.checks.length) {
        return <EmptyState message="Nenhum check de diagnostico disponivel." />;
      }
      return (
        <ul className="space-y-2">
          {diagnosticsData.checks.map((check) => (
            <li key={check.name} className="flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{check.name}</div>
                <div className="text-xs text-muted-foreground">{check.message}</div>
              </div>
              <Badge variant="outline">{check.level}</Badge>
            </li>
          ))}
        </ul>
      );
    }
  }
}

function PrefixTable({ rows }: { rows: NetopsBgpPrefixEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Prefixo</TableHead>
            <TableHead>Next-hop</TableHead>
            <TableHead>AS path</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.prefix}>
              <TableCell className="font-mono text-xs">{row.prefix}</TableCell>
              <TableCell className="font-mono text-xs">{row.nextHop ?? "-"}</TableCell>
              <TableCell className="text-xs">{row.asPath ?? "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : ""}>{value}</dd>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

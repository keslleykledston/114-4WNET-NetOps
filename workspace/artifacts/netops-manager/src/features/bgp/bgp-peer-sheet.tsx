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
import { useTranslation } from "@/i18n";
import { formatBgpUptime } from "./format-bgp-uptime";

export type BgpPeerActionKind =
  | "details"
  | "received"
  | "advertised"
  | "policies"
  | "communities"
  | "diagnostics";

const actionTitleKeys: Record<BgpPeerActionKind, string> = {
  details: "bgp.peerSheet.actions.details",
  received: "bgp.peerSheet.actions.received",
  advertised: "bgp.peerSheet.actions.advertised",
  policies: "bgp.peerSheet.actions.policies",
  communities: "bgp.peerSheet.actions.communities",
  diagnostics: "bgp.peerSheet.actions.diagnostics",
};

interface BgpPeerSheetProps {
  device: Device;
  peer: NetopsBgpPeer | null;
  action: BgpPeerActionKind | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BgpPeerSheet({ device, peer, action, open, onOpenChange }: BgpPeerSheetProps) {
  const { t } = useTranslation();
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
          <SheetTitle>{action ? t(actionTitleKeys[action]) : t("bgp.peerSheet.defaultTitle")}</SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {peer
              ? `${peer.peerIp} · ${peer.addressFamily} · AS ${peer.remoteAs ?? "-"}`
              : t("bgp.peerSheet.selectPeer")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {!peer || !action ? null : activeQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : activeQuery.isError ? (
            <EmptyState message={t("bgp.peerSheet.loadError")} />
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
  const { t } = useTranslation();

  switch (action) {
    case "details": {
      const data = detailsData ?? peer;
      return (
        <dl className="grid gap-3 text-sm">
          <DetailRow label={t("bgp.peerSheet.fields.peerIp")} value={data.peerIp} mono />
          <DetailRow label={t("bgp.peerSheet.fields.name")} value={data.description ?? data.name ?? "-"} />
          <DetailRow label={t("bgp.peerSheet.fields.remoteAsn")} value={data.remoteAs?.toString() ?? "-"} />
          <DetailRow label={t("bgp.peerSheet.fields.state")} value={data.state} />
          <DetailRow label={t("bgp.peerSheet.fields.role")} value={`${data.role} (${data.roleSource})`} />
          <DetailRow label={t("bgp.peerSheet.fields.addressFamily")} value={data.addressFamily} />
          <DetailRow label={t("bgp.peerSheet.fields.session")} value={data.sessionType} />
          <DetailRow label={t("bgp.peerSheet.fields.vrf")} value={data.vrf ?? "-"} />
          <DetailRow label={t("bgp.peerSheet.fields.importPolicy")} value={data.importPolicy ?? "-"} />
          <DetailRow label={t("bgp.peerSheet.fields.exportPolicy")} value={data.exportPolicy ?? "-"} />
          <DetailRow label={t("bgp.peerSheet.fields.uptime")} value={formatBgpUptime(data.uptime)} />
          <DetailRow label={t("bgp.peerSheet.fields.source")} value={data.source} />
        </dl>
      );
    }
    case "received":
    case "advertised": {
      const rows = action === "received" ? receivedData : advertisedData;
      if (!rows?.length) {
        return <EmptyState message={t("bgp.peerSheet.empty.noPrefixes")} />;
      }
      return <PrefixTable rows={rows} />;
    }
    case "policies": {
      if (!policiesData) return <EmptyState message={t("bgp.peerSheet.empty.policiesUnavailable")} />;
      return (
        <div className="space-y-3 text-sm">
          <DetailRow label="Import" value={policiesData.importPolicy ?? "-"} />
          <DetailRow label="Export" value={policiesData.exportPolicy ?? "-"} />
          <p className="text-xs text-muted-foreground">{policiesData.message}</p>
          {!policiesData.filters.length ? (
            <EmptyState message={t("bgp.peerSheet.empty.noFilters")} />
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
      if (!communitiesData) return <EmptyState message={t("bgp.peerSheet.empty.communitiesUnavailable")} />;
      return (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">{communitiesData.message}</p>
          {!communitiesData.communities.length ? (
            <EmptyState message={t("bgp.peerSheet.empty.noCommunities")} />
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
        return <EmptyState message={t("bgp.peerSheet.empty.noDiagnostics")} />;
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
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("bgp.peerSheet.prefixTable.prefix")}</TableHead>
            <TableHead>{t("bgp.peerSheet.prefixTable.nextHop")}</TableHead>
            <TableHead>{t("bgp.peerSheet.prefixTable.asPath")}</TableHead>
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

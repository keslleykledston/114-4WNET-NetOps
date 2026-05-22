import { useMemo, useState } from "react";
import {
  type AuditLog,
  getListAuditLogsQueryKey,
  useListAuditLogs,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Filter, ShieldCheck } from "lucide-react";

export default function AuditPage() {
  const queryClient = useQueryClient();
  const [action, setAction] = useState("");
  const [objectType, setObjectType] = useState("");
  const [objectId, setObjectId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const params = useMemo(() => ({
    action: action || undefined,
    objectType: objectType || undefined,
    objectId: objectId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    limit: 200,
  }), [action, dateFrom, dateTo, objectId, objectType]);

  const { data: rows, isLoading } = useListAuditLogs(params);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: getListAuditLogsQueryKey(params) });
  };

  const exportJson = () => {
    const payload = JSON.stringify(rows ?? [], null, 2);
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit-logs.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportMarkdown = () => {
    const header = ["| Date | Actor | Action | Object | Metadata |", "|---|---|---|---|---|"];
    const lines = (rows ?? []).map((row) => {
      const metadata = row.metadataJson ? JSON.stringify(row.metadataJson).replace(/\|/g, "\\|") : "—";
      return `| ${new Date(row.createdAt).toISOString()} | ${row.actor ?? "—"} | ${row.action} | ${row.objectType}:${row.objectId} | ${metadata} |`;
    });
    const blob = new Blob([["# Audit Logs", "", ...header, ...lines].join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit-logs.md";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit</h1>
          <p className="mt-1 text-muted-foreground">Operational audit trail and change history</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportJson} disabled={!rows?.length}>
            <Download className="mr-2 h-4 w-4" />
            Export JSON
          </Button>
          <Button variant="outline" onClick={exportMarkdown} disabled={!rows?.length}>
            <Download className="mr-2 h-4 w-4" />
            Export Markdown
          </Button>
          <Button variant="outline" onClick={refresh}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Action</Label>
            <Input value={action} onChange={(event) => setAction(event.target.value)} placeholder="device_update" />
          </div>
          <div className="space-y-2">
            <Label>Object Type</Label>
            <Input value={objectType} onChange={(event) => setObjectType(event.target.value)} placeholder="device" />
          </div>
          <div className="space-y-2">
            <Label>Object ID</Label>
            <Input value={objectId} onChange={(event) => setObjectId(event.target.value)} placeholder="3" />
          </div>
          <div className="space-y-2">
            <Label>Date From</Label>
            <Input type="datetime-local" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Date To</Label>
            <Input type="datetime-local" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Object</TableHead>
                <TableHead>Metadata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : !rows?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No logs found.</TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelected(row)}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{row.actor ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{row.action}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{row.objectType}:{row.objectId}</TableCell>
                  <TableCell className="max-w-[420px] truncate text-xs text-muted-foreground">
                    {row.metadataJson ? JSON.stringify(row.metadataJson) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Audit Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <Detail label="Date" value={new Date(selected.createdAt).toLocaleString()} />
                  <Detail label="Actor" value={selected.actor ?? "—"} />
                  <Detail label="Action" value={selected.action} />
                  <Detail label="Object" value={`${selected.objectType}:${selected.objectId}`} />
                  <Detail label="Source IP" value={selected.sourceIp ?? "—"} />
                  <Detail label="Actor ID" value={selected.actorId?.toString() ?? "—"} />
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metadata</div>
                  <pre className="overflow-x-auto rounded-md border bg-muted/20 p-4 text-xs leading-relaxed">
                    {JSON.stringify(selected.metadataJson ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm">{value}</div>
    </div>
  );
}

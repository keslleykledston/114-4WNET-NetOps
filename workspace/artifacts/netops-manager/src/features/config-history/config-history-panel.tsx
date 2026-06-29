import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Eye, GitCompare, History, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n";
import {
  downloadText,
  getConfig,
  getConfigDiff,
  listDeviceConfigHistory,
  type ConfigDetail,
  type ConfigDiff,
} from "./config-history-api";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

function parserVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (status === "SUCCESS") return "default";
  if (status === "PARTIAL" || status === "PENDING") return "secondary";
  if (status === "FAILED") return "destructive";
  return "outline";
}

function diffLineClass(line: string) {
  if (line.startsWith("+")) return "text-emerald-400 bg-emerald-950/20";
  if (line.startsWith("-")) return "text-red-400 bg-red-950/20";
  return "text-muted-foreground";
}

export function ConfigHistoryPanel({ deviceId, hostname }: { deviceId: number; hostname: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedConfig, setSelectedConfig] = useState<ConfigDetail | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<ConfigDiff | null>(null);

  const historyQuery = useQuery({
    queryKey: ["device-config-history", deviceId],
    queryFn: () => listDeviceConfigHistory(deviceId),
    enabled: Boolean(deviceId),
    refetchInterval: 15000,
  });

  const viewMutation = useMutation({
    mutationFn: getConfig,
    onSuccess: (data) => {
      setSelectedConfig(data);
      setSelectedDiff(null);
    },
    onError: (error: Error) => toast({ title: t("common.error"), description: error.message, variant: "destructive" }),
  });

  const diffMutation = useMutation({
    mutationFn: getConfigDiff,
    onSuccess: (data) => {
      setSelectedDiff(data);
      setSelectedConfig(null);
    },
    onError: (error: Error) => toast({ title: t("common.error"), description: error.message, variant: "destructive" }),
  });

  const downloadMutation = useMutation({
    mutationFn: getConfig,
    onSuccess: (data) => {
      const stamp = data.collected_at.replace(/[:.]/g, "-");
      downloadText(`${hostname}-config-${data.id}-${stamp}.txt`, data.raw_config ?? "");
    },
    onError: (error: Error) => toast({ title: t("common.error"), description: error.message, variant: "destructive" }),
  });

  const history = historyQuery.data ?? [];

  return (
    <div className="space-y-4">
      <Card className="border-border">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            {t("configHistory.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {historyQuery.isLoading ? (
            <div className="p-6"><Skeleton className="h-48 w-full" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("configHistory.date")}</TableHead>
                  <TableHead>{t("configHistory.source")}</TableHead>
                  <TableHead>{t("configHistory.size")}</TableHead>
                  <TableHead>{t("configHistory.hash")}</TableHead>
                  <TableHead>{t("configHistory.parserStatus")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs">{new Date(item.collected_at).toLocaleString()}</TableCell>
                    <TableCell>{item.source ?? "unknown"}</TableCell>
                    <TableCell>{formatBytes(item.size_bytes)}</TableCell>
                    <TableCell className="font-mono text-xs">{item.hash.slice(0, 12)}</TableCell>
                    <TableCell>
                      <Badge variant={parserVariant(item.parser_status)}>{item.parser_status ?? "PENDING"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => viewMutation.mutate(item.id)}>
                          <Eye className="h-4 w-4 mr-1" />
                          {t("configHistory.view")}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => diffMutation.mutate(item.id)}>
                          <GitCompare className="h-4 w-4 mr-1" />
                          {t("configHistory.compare")}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => downloadMutation.mutate(item.id)}>
                          <Download className="h-4 w-4 mr-1" />
                          {t("configHistory.download")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {history.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {t("configHistory.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedConfig ? (
        <Card className="border-border">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="text-lg flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              {t("configHistory.configTitle", { id: selectedConfig.id })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <pre className="p-4 overflow-x-auto text-xs font-mono text-muted-foreground max-h-[600px]">
              {selectedConfig.raw_config ?? ""}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {selectedDiff ? (
        <Card className="border-border">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="text-lg flex items-center gap-2">
              <GitCompare className="h-5 w-5" />
              {t("configHistory.diffTitle", { id: selectedDiff.id })}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{selectedDiff.diff_summary ?? t("configHistory.noSummary")}</p>
          </CardHeader>
          <CardContent className="p-0">
            <pre className="p-4 overflow-x-auto text-xs font-mono max-h-[600px]">
              {(selectedDiff.diff_text ?? "").split("\n").map((line, index) => (
                <div key={`${index}-${line}`} className={diffLineClass(line)}>
                  {line || " "}
                </div>
              ))}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

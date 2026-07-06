import { useMemo, useState } from "react";
import {
  getListReportsQueryKey,
  useCreateProvisioningReport,
  useListReports,
  type Report,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { FileText, Copy, Download, RefreshCw } from "lucide-react";
import { useTranslation } from "@/i18n";

export default function ReportsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: reports, isLoading } = useListReports();
  const createReport = useCreateProvisioningReport();
  const [selected, setSelected] = useState<Report | null>(null);

  const sortedReports = useMemo(() => [...(reports ?? [])], [reports]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });
  };

  const handleGenerate = async (jobId: number) => {
    createReport.mutate({ id: jobId }, {
      onSuccess: async () => {
        await refresh();
        toast({ title: t("reports.generated") });
      },
      onError: () => toast({ title: t("reports.generateFailed"), variant: "destructive" }),
    });
  };

  const copyMarkdown = async (markdown: string) => {
    await navigator.clipboard.writeText(markdown);
    toast({ title: t("reports.markdownCopied") });
  };

  const downloadMarkdown = (report: Report) => {
    const blob = new Blob([report.contentMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `report-${report.id}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("reports.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("reports.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={refresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("common.refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.generatedReports")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("common.type")}</TableHead>
                <TableHead>{t("reports.job")}</TableHead>
                <TableHead>{t("reports.generatedBy")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">{t("common.loading")}...</TableCell>
                </TableRow>
              ) : !sortedReports.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">{t("reports.noReports")}</TableCell>
                </TableRow>
              ) : sortedReports.map((report) => (
                <TableRow key={report.id} className="cursor-pointer" onClick={() => setSelected(report)}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(report.generatedAt).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline">{report.reportType}</Badge></TableCell>
                  <TableCell>{report.jobName ?? `Job #${report.provisioningJobId}`}</TableCell>
                  <TableCell>{report.generatedBy ?? "system"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleGenerate(report.provisioningJobId);
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      {t("reports.regenerate")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader className="flex flex-row items-center justify-between gap-3">
            <DialogTitle>{t("reports.reportMarkdown")}</DialogTitle>
            {selected && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => copyMarkdown(selected.contentMarkdown)}>
                  <Copy className="mr-2 h-4 w-4" />
                  {t("reports.copyMarkdown")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadMarkdown(selected)}>
                  <Download className="mr-2 h-4 w-4" />
                  {t("reports.downloadMd")}
                </Button>
              </div>
            )}
          </DialogHeader>
          {selected && (
            <ScrollArea className="max-h-[72vh] pr-4">
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/20 p-4 text-xs leading-relaxed">
                {selected.contentMarkdown}
              </pre>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

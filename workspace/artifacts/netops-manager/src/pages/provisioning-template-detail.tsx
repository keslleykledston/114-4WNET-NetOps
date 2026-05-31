import { useRoute, useLocation } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useTemplateDetail,
  useTemplateVersions,
  useTemplateDiff,
  useTemplateAuditLogs,
  exportTemplate,
} from "@/features/provisioning-templates/provisioning-templates-api";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Download, AlertCircle } from "lucide-react";

const statusColors: Record<string, string> = {
  SYSTEM: "bg-blue-100 text-blue-800",
  CUSTOM: "bg-purple-100 text-purple-800",
  DRAFT: "bg-gray-100 text-gray-800",
  APPROVED: "bg-green-100 text-green-800",
  DEPRECATED: "bg-amber-100 text-amber-800",
};

export default function ProvisioningTemplateDetailPage() {
  const [match, params] = useRoute("/provisioning/templates/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [diffVersionA, setDiffVersionA] = useState<string>("");
  const [diffVersionB, setDiffVersionB] = useState<string>("");

  const id = params?.id ? Number(params.id) : 0;

  const { data: template, isLoading } = useTemplateDetail(id);
  const { data: versions } = useTemplateVersions(id);
  const { data: diffs } = useTemplateDiff(id, diffVersionA, diffVersionB);
  const { data: auditLogs } = useTemplateAuditLogs(id);

  if (!match) return null;

  const handleExport = async () => {
    try {
      const blob = await exportTemplate(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `template-${id}-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Template exported successfully" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  if (isLoading || !template) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading template…</p>
      </div>
    );
  }

  let variablesData: Record<string, any> = {};
  if (template.variablesJson) {
    try {
      variablesData = JSON.parse(template.variablesJson);
    } catch {
      // Invalid JSON
    }
  }

  let validationData: Record<string, any> = {};
  if (template.validationRulesJson) {
    try {
      validationData = JSON.parse(template.validationRulesJson);
    } catch {
      // Invalid JSON
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/provisioning/templates")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{template.name}</h1>
          <p className="text-muted-foreground text-sm">
            {template.vendor} • {template.serviceType} • v{template.version}
          </p>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        <Badge className={statusColors[template.status] || "bg-gray-100"}>{template.status}</Badge>
        {!template.editable && (
          <Badge variant="outline" className="bg-amber-50 border-amber-200">
            System — Read-only
          </Badge>
        )}
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {template.description && <p className="text-muted-foreground">{template.description}</p>}

      <Tabs defaultValue="variables" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="variables">Variables</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="variables" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Template Variables</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(variablesData).length === 0 ? (
                <p className="text-sm text-muted-foreground">No variables defined</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Required</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(variablesData).map(([key, value]: [string, any]) => (
                      <TableRow key={key}>
                        <TableCell className="font-mono text-sm">{key}</TableCell>
                        <TableCell className="text-sm">{value.type || "string"}</TableCell>
                        <TableCell>
                          {value.required ? (
                            <Badge variant="outline" className="bg-red-50">
                              Yes
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{value.description || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Validation Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {validationData.risks && validationData.risks.length > 0 && (
                <div>
                  <p className="font-semibold mb-2">Risks</p>
                  <ul className="space-y-1 text-sm">
                    {validationData.risks.map((risk: any, idx: number) => (
                      <li key={idx} className="flex gap-2">
                        <span className="text-red-600">•</span>
                        <span>{typeof risk === "string" ? risk : risk.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {validationData.precheckHints && validationData.precheckHints.length > 0 && (
                <div>
                  <p className="font-semibold mb-2">Pre-check Hints</p>
                  <ul className="space-y-1 text-sm">
                    {validationData.precheckHints.map((hint: string, idx: number) => (
                      <li key={idx} className="flex gap-2">
                        <span className="text-blue-600">•</span>
                        <span>{hint}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {validationData.postcheckHints && validationData.postcheckHints.length > 0 && (
                <div>
                  <p className="font-semibold mb-2">Post-check Hints</p>
                  <ul className="space-y-1 text-sm">
                    {validationData.postcheckHints.map((hint: string, idx: number) => (
                      <li key={idx} className="flex gap-2">
                        <span className="text-green-600">•</span>
                        <span>{hint}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!validationData.risks?.length &&
                !validationData.precheckHints?.length &&
                !validationData.postcheckHints?.length && (
                  <p className="text-sm text-muted-foreground">No validation rules defined</p>
                )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Read-only preview — template body is not executed. Variables shown as literals.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Template Body</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap break-words">
                {template.templateBody || "No template body"}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="versions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Version History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!versions || versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No versions found</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Version</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Changed By</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {versions.map((version) => (
                        <TableRow key={version.id}>
                          <TableCell className="font-mono text-sm">{version.version}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{version.status}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{version.changedBy || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(version.createdAt).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDiffVersionA(version.version);
                                setDiffVersionB(versions[0]?.version || "");
                              }}
                            >
                              Diff
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {diffVersionA && diffVersionB && diffs && (
                    <div className="mt-4 p-4 bg-slate-50 rounded border">
                      <p className="text-sm font-semibold mb-2">
                        Diff: {diffVersionA} vs {diffVersionB}
                      </p>
                      <pre className="text-xs font-mono max-h-40 overflow-auto bg-slate-900 text-slate-100 p-2 rounded">
                        {diffs.map((diff, idx) => (
                          <div
                            key={idx}
                            className={
                              diff.type === "added"
                                ? "text-green-400"
                                : diff.type === "removed"
                                  ? "text-red-400"
                                  : "text-gray-400"
                            }
                          >
                            {diff.type === "added" ? "+ " : diff.type === "removed" ? "- " : "  "}
                            {diff.line}
                          </div>
                        ))}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Audit Logs</CardTitle>
            </CardHeader>
            <CardContent>
              {!auditLogs || auditLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No audit logs</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant="outline">{log.action}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{log.actor}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString("pt-BR")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

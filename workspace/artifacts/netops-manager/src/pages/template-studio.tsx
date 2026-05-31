import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useDraftList, createDraft, updateDraft, validateDraft, previewDraft, approveDraft, publishDraft } from "@/features/template-studio/template-studio-api";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { Pencil, AlertCircle, CheckCircle } from "lucide-react";

export default function TemplateStudioPage() {
  const { data: drafts, refetch } = useDraftList();
  const { user } = useAuth();
  const { toast } = useToast();
  const [view, setView] = useState<"list" | "edit">("list");
  const [currentDraft, setCurrentDraft] = useState<{ id?: number; body: string }>({ body: "" });
  const [validation, setValidation] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);

  const handleSave = async () => {
    try {
      if (currentDraft.id) {
        await updateDraft(currentDraft.id, currentDraft.body);
      } else {
        await createDraft(currentDraft.body);
      }
      toast({ title: "Draft saved" });
      setView("list");
      refetch();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  };

  const handleValidate = async () => {
    try {
      const result = await validateDraft(currentDraft.id || 0);
      setValidation(result);
    } catch (err) {
      toast({ title: "Validation error", variant: "destructive" });
    }
  };

  const handlePreview = async () => {
    try {
      const result = await previewDraft(currentDraft.id || 0);
      setPreview(result);
    } catch (err) {
      toast({ title: "Preview error", variant: "destructive" });
    }
  };

  const handlePublish = async () => {
    try {
      await publishDraft(currentDraft.id || 0);
      toast({ title: "Template published!" });
      setView("list");
      refetch();
    } catch (err) {
      toast({ title: "Publish failed", variant: "destructive" });
    }
  };

  const handleApprove = async () => {
    try {
      await approveDraft(currentDraft.id || 0);
      toast({ title: "Draft approved" });
      setView("list");
      refetch();
    } catch (err) {
      toast({ title: "Approval failed", variant: "destructive" });
    }
  };

  if (view === "edit") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => setView("list")}>
            ← Back
          </Button>
          <h1 className="text-2xl font-bold">Template Studio — {currentDraft.id ? "Edit" : "Create"}</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>DSL Template</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={currentDraft.body}
              onChange={(e) => setCurrentDraft({ ...currentDraft, body: e.target.value })}
              placeholder="meta:&#10;  name: my-template&#10;  vendor: Huawei&#10;  service_type: bgp_peer_customer&#10;inputs:&#10;  bgp_asn:&#10;    type: integer"
              className="font-mono h-96 whitespace-pre"
            />
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button onClick={handleSave}>Save</Button>
          {currentDraft.id && (
            <>
              <Button onClick={handleValidate} variant="outline">
                Validate
              </Button>
              <Button onClick={handlePreview} variant="outline">
                Preview
              </Button>
            </>
          )}
        </div>

        {validation && (
          <Card>
            <CardHeader>
              <CardTitle>Validation {validation.passed ? "✓ PASSED" : "✗ FAILED"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {validation.errors?.length > 0 && (
                <div>
                  <p className="font-semibold text-red-600">Errors:</p>
                  <ul className="list-disc pl-5 text-sm text-red-600">
                    {validation.errors.map((e: string, i: number) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              {validation.warnings?.length > 0 && (
                <div>
                  <p className="font-semibold text-amber-600">Warnings:</p>
                  <ul className="list-disc pl-5 text-sm text-amber-600">
                    {validation.warnings.map((w: string, i: number) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {preview && (
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-semibold mb-2">Generated CLI:</p>
                <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs max-h-40 overflow-auto">
                  {preview.cli}
                </pre>
              </div>
              {user?.role === "admin" && (
                <Button onClick={handlePublish} className="bg-green-600">
                  Publish Version
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Pencil className="h-8 w-8" />
        <h1 className="text-3xl font-bold">Template Studio</h1>
      </div>

      <Button onClick={() => { setView("edit"); setCurrentDraft({ body: "" }); }} className="bg-blue-600">
        New Draft
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Drafts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drafts?.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>#{d.id}</TableCell>
                  <TableCell>
                    <Badge>{d.status}</Badge>
                  </TableCell>
                  <TableCell>{d.createdBy}</TableCell>
                  <TableCell className="text-xs">{new Date(d.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setCurrentDraft({ id: d.id, body: d.draftBody }); setView("edit"); }}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

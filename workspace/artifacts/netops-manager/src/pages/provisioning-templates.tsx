import { useLocation } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTemplateRegistry } from "@/features/provisioning-templates/provisioning-templates-api";
import { FileCode, Loader2 } from "lucide-react";

const statusColors: Record<string, string> = {
  SYSTEM: "bg-blue-100 text-blue-800",
  CUSTOM: "bg-purple-100 text-purple-800",
  DRAFT: "bg-gray-100 text-gray-800",
  APPROVED: "bg-green-100 text-green-800",
  DEPRECATED: "bg-amber-100 text-amber-800",
};

export default function ProvisioningTemplatesPage() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [vendorFilter, setVendorFilter] = useState<string>("");

  const { data: templates, isLoading } = useTemplateRegistry({
    status: statusFilter || undefined,
    vendor: vendorFilter || undefined,
  });

  const vendors = Array.from(new Set(templates?.map((t) => t.vendor) || []));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileCode className="h-8 w-8" />
            Template Registry
          </h1>
          <p className="text-muted-foreground mt-1">
            v0.8.1 — read-only templates with versioning and audit logs
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4 flex-wrap">
          <div className="min-w-48">
            <label className="text-xs text-muted-foreground block mb-2">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All statuses</SelectItem>
                <SelectItem value="SYSTEM">SYSTEM</SelectItem>
                <SelectItem value="CUSTOM">CUSTOM</SelectItem>
                <SelectItem value="DRAFT">DRAFT</SelectItem>
                <SelectItem value="APPROVED">APPROVED</SelectItem>
                <SelectItem value="DEPRECATED">DEPRECATED</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-48">
            <label className="text-xs text-muted-foreground block mb-2">Vendor</label>
            <Select value={vendorFilter} onValueChange={setVendorFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All vendors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All vendors</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Templates ({templates?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Service Type</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading templates…
                    </div>
                  </TableCell>
                </TableRow>
              ) : !templates || templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No templates found
                  </TableCell>
                </TableRow>
              ) : (
                templates.map((template) => (
                  <TableRow key={template.id} className="hover:bg-muted/50 cursor-pointer">
                    <TableCell className="font-semibold">{template.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{template.vendor}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{template.serviceType}</TableCell>
                    <TableCell className="text-sm">{template.version}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[template.status] || "bg-gray-100"}>
                        {template.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(template.createdAt).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLocation(`/provisioning/templates/${template.id}`)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

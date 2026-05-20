import { useState } from "react";
import { 
  useListConfigTemplates, getListConfigTemplatesQueryKey,
  useCreateConfigTemplate, useDeleteConfigTemplate
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileCode, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Templates() {
  const { data: templates, isLoading } = useListConfigTemplates();
  const createTemplate = useCreateConfigTemplate();
  const deleteTemplate = useDeleteConfigTemplate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    type: "l3vpn",
    vendor: "cisco",
    platform: "ios-xr",
    template: ""
  });

  const handleCreate = () => {
    createTemplate.mutate({ data: newTemplate }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListConfigTemplatesQueryKey() });
        setIsCreateOpen(false);
        toast({ title: "Template created" });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete template?")) {
      deleteTemplate.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListConfigTemplatesQueryKey() });
          toast({ title: "Template deleted" });
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
          <p className="text-muted-foreground mt-1">Manage configuration templates</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New Template</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Template</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input value={newTemplate.name} onChange={e => setNewTemplate({...newTemplate, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Select value={newTemplate.type} onValueChange={v => setNewTemplate({...newTemplate, type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="l2vpn">L2VPN</SelectItem>
                    <SelectItem value="l3vpn">L3VPN</SelectItem>
                    <SelectItem value="vlan">VLAN</SelectItem>
                    <SelectItem value="interface">Interface</SelectItem>
                    <SelectItem value="bgp">BGP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Vendor/Platform</label>
                <div className="flex gap-2">
                  <Select value={newTemplate.vendor} onValueChange={v => setNewTemplate({...newTemplate, vendor: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cisco">Cisco</SelectItem>
                      <SelectItem value="juniper">Juniper</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input value={newTemplate.platform} onChange={e => setNewTemplate({...newTemplate, platform: e.target.value})} placeholder="e.g. ios-xr" />
                </div>
              </div>
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">Jinja2 Template Content</label>
                <Textarea 
                  className="font-mono text-xs min-h-[200px]" 
                  value={newTemplate.template} 
                  onChange={e => setNewTemplate({...newTemplate, template: e.target.value})}
                  placeholder="vrf definition {{ vrf_name }}..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createTemplate.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Vendor / OS</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : templates?.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No templates found.</TableCell></TableRow>
              ) : (
                templates?.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileCode className="h-4 w-4 text-muted-foreground" />
                        {t.name}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="uppercase text-[10px]">{t.type}</Badge></TableCell>
                    <TableCell>
                      <span className="capitalize">{t.vendor}</span> <span className="text-muted-foreground text-xs uppercase">{t.platform}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(t.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
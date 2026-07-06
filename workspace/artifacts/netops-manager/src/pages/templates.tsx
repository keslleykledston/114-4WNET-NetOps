import { useState } from "react";
import { 
  useListConfigTemplates, getListConfigTemplatesQueryKey,
  useCreateConfigTemplate, useDeleteConfigTemplate
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileCode, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { platformOptionsForVendor, VENDOR_OPTIONS } from "@/lib/vendor-options";
import { useTranslation } from "@/i18n";

export default function Templates() {
  const { t } = useTranslation();
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
        toast({ title: t("templates.created") });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm(t("templates.deleteConfirm"))) {
      deleteTemplate.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListConfigTemplatesQueryKey() });
          toast({ title: t("templates.deleted") });
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("templates.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("templates.subtitle")}</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> {t("templates.newTemplate")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("templates.createTemplate")}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">{t("common.name")}</label>
                <Input value={newTemplate.name} onChange={e => setNewTemplate({...newTemplate, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("common.type")}</label>
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
                <label className="text-sm font-medium">{t("templates.vendorPlatform")}</label>
                <div className="flex gap-2">
                  <Select
                    value={newTemplate.vendor}
                    onValueChange={(v) => {
                      const platforms = platformOptionsForVendor(v);
                      setNewTemplate({
                        ...newTemplate,
                        vendor: v,
                        platform: platforms[0]?.value ?? newTemplate.platform,
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VENDOR_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={newTemplate.platform}
                    onValueChange={(v) => setNewTemplate({ ...newTemplate, platform: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {platformOptionsForVendor(newTemplate.vendor).map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">{t("templates.jinjaContent")}</label>
                <Textarea 
                  className="font-mono text-xs min-h-[200px]" 
                  value={newTemplate.template} 
                  onChange={e => setNewTemplate({...newTemplate, template: e.target.value})}
                  placeholder="vrf definition {{ vrf_name }}..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createTemplate.isPending}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.type")}</TableHead>
                <TableHead>{t("templates.vendorOs")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">{t("common.loading")}...</TableCell></TableRow>
              ) : templates?.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t("templates.noTemplates")}</TableCell></TableRow>
              ) : (
                templates?.map(tpl => (
                  <TableRow key={tpl.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileCode className="h-4 w-4 text-muted-foreground" />
                        {tpl.name}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="uppercase text-[10px]">{tpl.type}</Badge></TableCell>
                    <TableCell>
                      <span className="capitalize">{tpl.vendor}</span> <span className="text-muted-foreground text-xs uppercase">{tpl.platform}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(tpl.id)}>
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

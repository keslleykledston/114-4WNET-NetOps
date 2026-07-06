import { useState } from "react";
import { 
  useListCompliancePolicies, getListCompliancePoliciesQueryKey,
  useCreateCompliancePolicy, useDeleteCompliancePolicy
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollText, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n";

export default function Policies() {
  const { t } = useTranslation();
  const { data: policies, isLoading } = useListCompliancePolicies();
  const createPolicy = useCreateCompliancePolicy();
  const deletePolicy = useDeleteCompliancePolicy();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newPolicy, setNewPolicy] = useState({
    name: "",
    context: "sysname",
    severity: "high",
    ruleType: "presence",
    rulePattern: ""
  });

  const handleCreate = () => {
    createPolicy.mutate({ data: newPolicy as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCompliancePoliciesQueryKey() });
        setIsCreateOpen(false);
        toast({ title: t("policies.created") });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm(t("policies.deleteConfirm"))) {
      deletePolicy.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCompliancePoliciesQueryKey() });
          toast({ title: t("policies.deleted") });
        }
      });
    }
  };

  const getSeverityColor = (sev: string) => {
    switch(sev) {
      case 'critical': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'high': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'medium': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
      case 'low': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default: return 'bg-slate-500/10 text-slate-500';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("policies.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("policies.subtitle")}</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> {t("policies.newPolicy")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("policies.createPolicy")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("common.name")}</label>
                <Input value={newPolicy.name} onChange={e => setNewPolicy({...newPolicy, name: e.target.value})} placeholder="Require NTP Servers" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("policies.context")}</label>
                  <Select value={newPolicy.context} onValueChange={v => setNewPolicy({...newPolicy, context: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sysname">Sysname</SelectItem>
                      <SelectItem value="vlan">VLAN</SelectItem>
                      <SelectItem value="bgp">BGP</SelectItem>
                      <SelectItem value="ntp">NTP</SelectItem>
                      <SelectItem value="snmp">SNMP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("compliance.severity")}</label>
                  <Select value={newPolicy.severity} onValueChange={v => setNewPolicy({...newPolicy, severity: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("policies.ruleType")}</label>
                  <Select value={newPolicy.ruleType} onValueChange={v => setNewPolicy({...newPolicy, ruleType: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="presence">{t("policies.ruleTypes.presence")}</SelectItem>
                      <SelectItem value="absence">{t("policies.ruleTypes.absence")}</SelectItem>
                      <SelectItem value="regex">{t("policies.ruleTypes.regex")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("policies.patternValue")}</label>
                  <Input value={newPolicy.rulePattern} onChange={e => setNewPolicy({...newPolicy, rulePattern: e.target.value})} placeholder="ntp server \d+\.\d+\.\d+\.\d+" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createPolicy.isPending}>{t("common.save")}</Button>
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
                <TableHead>{t("policies.context")}</TableHead>
                <TableHead>{t("compliance.severity")}</TableHead>
                <TableHead>{t("policies.rule")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">{t("common.loading")}...</TableCell></TableRow>
              ) : policies?.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("policies.noPolicies")}</TableCell></TableRow>
              ) : (
                policies?.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <ScrollText className="h-4 w-4 text-muted-foreground" />
                        {p.name}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="font-mono text-[10px]">{p.context}</Badge></TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getSeverityColor(p.severity)}>{p.severity}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.ruleType}: {p.rulePattern || 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(p.id)}>
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

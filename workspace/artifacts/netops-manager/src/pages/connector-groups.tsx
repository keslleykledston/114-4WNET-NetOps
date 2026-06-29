import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw, Save, Trash2, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  createConnectorGroup,
  createTenant,
  deleteConnectorGroup,
  getConnectorGroup,
  listConnectorGroups,
  listConnectors,
  listTenants,
  removeConnectorGroupMember,
  type ConnectorGroupStrategy,
  updateConnectorGroup,
  upsertConnectorGroupMember,
} from "@/features/connectors/connectors-api";
import { useTranslation } from "@/i18n";

const STRATEGIES: ConnectorGroupStrategy[] = ["ACTIVE_PASSIVE", "ROUND_ROBIN", "PRIORITY"];

export default function ConnectorGroupsPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [tenantName, setTenantName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupTenantId, setGroupTenantId] = useState("");
  const [groupStrategy, setGroupStrategy] = useState<ConnectorGroupStrategy>("ACTIVE_PASSIVE");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [memberConnectorId, setMemberConnectorId] = useState("");
  const [memberPriority, setMemberPriority] = useState("100");
  const [memberWeight, setMemberWeight] = useState("1");

  const tenantsQuery = useQuery({ queryKey: ["connectors", "tenants"], queryFn: listTenants });
  const groupsQuery = useQuery({ queryKey: ["connector-groups"], queryFn: listConnectorGroups, refetchInterval: 30_000 });
  const connectorsQuery = useQuery({ queryKey: ["connectors"], queryFn: listConnectors, refetchInterval: 30_000 });
  const selectedGroupQuery = useQuery({
    queryKey: ["connector-group", selectedGroupId],
    queryFn: () => getConnectorGroup(selectedGroupId ?? 0),
    enabled: Boolean(selectedGroupId),
  });

  const createTenantMutation = useMutation({
    mutationFn: () => createTenant({ name: tenantName }),
    onSuccess: () => {
      setTenantName("");
      void queryClient.invalidateQueries({ queryKey: ["connectors", "tenants"] });
      toast({ title: t("connectorGroups.toastTenantCreated") });
    },
    onError: (error: Error) => toast({ title: t("connectorGroups.error"), description: error.message, variant: "destructive" }),
  });

  const createGroupMutation = useMutation({
    mutationFn: () => createConnectorGroup({
      tenant_id: Number(groupTenantId),
      name: groupName.trim(),
      strategy: groupStrategy,
    }),
    onSuccess: (group) => {
      setGroupName("");
      setSelectedGroupId(group.id);
      void queryClient.invalidateQueries({ queryKey: ["connector-groups"] });
      toast({ title: t("connectorGroups.toastGroupCreated") });
    },
    onError: (error: Error) => toast({ title: t("connectorGroups.error"), description: error.message, variant: "destructive" }),
  });

  const updateGroupMutation = useMutation({
    mutationFn: () => {
      if (!selectedGroupId) throw new Error("No group selected");
      return updateConnectorGroup(selectedGroupId, {
        name: groupName.trim(),
        strategy: groupStrategy,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connector-groups"] });
      void queryClient.invalidateQueries({ queryKey: ["connector-group", selectedGroupId] });
      toast({ title: t("connectorGroups.toastGroupUpdated") });
    },
    onError: (error: Error) => toast({ title: t("connectorGroups.error"), description: error.message, variant: "destructive" }),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: number) => deleteConnectorGroup(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connector-groups"] });
      setSelectedGroupId(null);
      toast({ title: t("connectorGroups.toastGroupRemoved") });
    },
    onError: (error: Error) => toast({ title: t("connectorGroups.error"), description: error.message, variant: "destructive" }),
  });

  const addMemberMutation = useMutation({
    mutationFn: () => {
      if (!selectedGroupId) throw new Error("No group selected");
      return upsertConnectorGroupMember(selectedGroupId, Number(memberConnectorId), {
        priority: Number(memberPriority) || 100,
        weight: Number(memberWeight) || 1,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connector-groups"] });
      void queryClient.invalidateQueries({ queryKey: ["connector-group", selectedGroupId] });
      setMemberConnectorId("");
      toast({ title: t("connectorGroups.toastMemberSaved") });
    },
    onError: (error: Error) => toast({ title: t("connectorGroups.error"), description: error.message, variant: "destructive" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (connectorId: number) => {
      if (!selectedGroupId) throw new Error("No group selected");
      return removeConnectorGroupMember(selectedGroupId, connectorId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connector-groups"] });
      void queryClient.invalidateQueries({ queryKey: ["connector-group", selectedGroupId] });
      toast({ title: t("connectorGroups.toastMemberRemoved") });
    },
    onError: (error: Error) => toast({ title: t("connectorGroups.error"), description: error.message, variant: "destructive" }),
  });

  const selectedGroup = selectedGroupQuery.data ?? null;
  const selectedTenantId = selectedGroup?.tenant_id?.toString() ?? groupTenantId;
  const availableConnectors = useMemo(() => {
    if (!selectedTenantId) return connectorsQuery.data ?? [];
    return (connectorsQuery.data ?? []).filter((connector) => String(connector.tenant_id) === selectedTenantId);
  }, [connectorsQuery.data, selectedTenantId]);

  const groups = groupsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Waypoints className="h-6 w-6 text-primary" />
            {t("connectorGroups.title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("connectorGroups.pageSubtitle")}</p>
        </div>
        <Button variant="outline" onClick={() => void groupsQuery.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("connectorGroups.refresh")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("connectorGroups.newTenant")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder={t("connectorGroups.tenantPlaceholder")} />
              <Button disabled={!tenantName.trim() || createTenantMutation.isPending} onClick={() => createTenantMutation.mutate()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("connectorGroups.newGroup")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("connectorGroups.tenant")}</Label>
                <Select value={groupTenantId || "none"} onValueChange={(value) => setGroupTenantId(value === "none" ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder={t("connectorGroups.select")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("connectorGroups.select")}</SelectItem>
                    {(tenantsQuery.data ?? []).map((tenant) => (
                      <SelectItem key={tenant.id} value={String(tenant.id)}>{tenant.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-1">
                <Label>{t("connectorGroups.name")}</Label>
                <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={t("connectorGroups.groupNamePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("connectorGroups.strategy")}</Label>
                <Select value={groupStrategy} onValueChange={(value) => setGroupStrategy(value as ConnectorGroupStrategy)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STRATEGIES.map((strategy) => (
                      <SelectItem key={strategy} value={strategy}>{strategy}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              disabled={!groupTenantId || !groupName.trim() || createGroupMutation.isPending}
              onClick={() => createGroupMutation.mutate()}
            >
              {t("connectorGroups.createGroup")}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("connectorGroups.groups")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("connectorGroups.name")}</TableHead>
                <TableHead>{t("connectorGroups.tenant")}</TableHead>
                <TableHead>{t("connectorGroups.strategy")}</TableHead>
                <TableHead>{t("connectorGroups.members")}</TableHead>
                <TableHead>{t("connectorGroups.active")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell>{group.tenant_name}</TableCell>
                  <TableCell><Badge variant="secondary">{group.strategy}</Badge></TableCell>
                  <TableCell>{group.member_count}</TableCell>
                  <TableCell>{group.active_member_count}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedGroupId(group.id);
                        setGroupName(group.name);
                        setGroupStrategy(group.strategy);
                        setGroupTenantId(String(group.tenant_id));
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteGroupMutation.mutate(group.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedGroup ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {selectedGroup.name} · {selectedGroup.tenant_name}
            </CardTitle>
            <Badge variant="outline">{selectedGroup.strategy}</Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("connectorGroups.name")}</Label>
                <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("connectorGroups.strategy")}</Label>
                <Select value={groupStrategy} onValueChange={(value) => setGroupStrategy(value as ConnectorGroupStrategy)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STRATEGIES.map((strategy) => (
                      <SelectItem key={strategy} value={strategy}>{strategy}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={() => updateGroupMutation.mutate()} disabled={updateGroupMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  {t("connectorGroups.save")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void selectedGroupQuery.refetch()}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t("connectorGroups.reload")}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("connectorGroups.connector")}</Label>
                <Select value={memberConnectorId || "none"} onValueChange={(value) => setMemberConnectorId(value === "none" ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder={t("connectorGroups.select")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("connectorGroups.select")}</SelectItem>
                    {availableConnectors.map((connector) => (
                      <SelectItem key={connector.id} value={String(connector.id)}>
                        {connector.name} · {connector.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("connectorGroups.priority")}</Label>
                <Input type="number" value={memberPriority} onChange={(e) => setMemberPriority(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("connectorGroups.weight")}</Label>
                <Input type="number" value={memberWeight} onChange={(e) => setMemberWeight(e.target.value)} />
              </div>
            </div>

            <Button
              disabled={!memberConnectorId || addMemberMutation.isPending}
              onClick={() => addMemberMutation.mutate()}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("connectorGroups.addUpdateMember")}
            </Button>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("connectorGroups.connector")}</TableHead>
                  <TableHead>{t("connectorGroups.status")}</TableHead>
                  <TableHead>{t("connectorGroups.priority")}</TableHead>
                  <TableHead>{t("connectorGroups.weight")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(selectedGroupQuery.data?.members ?? []).map((member) => (
                  <TableRow key={member.connector_id}>
                    <TableCell className="font-medium">{member.connector_name}</TableCell>
                    <TableCell>
                      <Badge variant={member.connector_status === "ONLINE" ? "default" : "secondary"}>
                        {member.connector_status}
                      </Badge>
                    </TableCell>
                    <TableCell>{member.priority}</TableCell>
                    <TableCell>{member.weight}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removeMemberMutation.mutate(member.connector_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

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

const STRATEGIES: ConnectorGroupStrategy[] = ["ACTIVE_PASSIVE", "ROUND_ROBIN", "PRIORITY"];

export default function ConnectorGroupsPage() {
  const { toast } = useToast();
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
      toast({ title: "Tenant criado" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
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
      toast({ title: "Grupo criado" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
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
      toast({ title: "Grupo atualizado" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: number) => deleteConnectorGroup(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connector-groups"] });
      setSelectedGroupId(null);
      toast({ title: "Grupo removido" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
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
      toast({ title: "Membro salvo" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (connectorId: number) => {
      if (!selectedGroupId) throw new Error("No group selected");
      return removeConnectorGroupMember(selectedGroupId, connectorId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connector-groups"] });
      void queryClient.invalidateQueries({ queryKey: ["connector-group", selectedGroupId] });
      toast({ title: "Membro removido" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
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
            Connector Groups
          </h1>
          <p className="text-muted-foreground mt-1">Agrupamento e failover de connectors por tenant.</p>
        </div>
        <Button variant="outline" onClick={() => void groupsQuery.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo tenant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="Tenant A" />
              <Button disabled={!tenantName.trim() || createTenantMutation.isPending} onClick={() => createTenantMutation.mutate()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo grupo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Tenant</Label>
                <Select value={groupTenantId || "none"} onValueChange={(value) => setGroupTenantId(value === "none" ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione</SelectItem>
                    {(tenantsQuery.data ?? []).map((tenant) => (
                      <SelectItem key={tenant.id} value={String(tenant.id)}>{tenant.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-1">
                <Label>Nome</Label>
                <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Default HA" />
              </div>
              <div className="space-y-2">
                <Label>Strategy</Label>
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
              Criar grupo
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grupos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Membros</TableHead>
                <TableHead>Ativos</TableHead>
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
                <Label>Nome</Label>
                <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Strategy</Label>
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
                  Salvar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void selectedGroupQuery.refetch()}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Recarregar
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Connector</Label>
                <Select value={memberConnectorId || "none"} onValueChange={(value) => setMemberConnectorId(value === "none" ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione</SelectItem>
                    {availableConnectors.map((connector) => (
                      <SelectItem key={connector.id} value={String(connector.id)}>
                        {connector.name} · {connector.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input type="number" value={memberPriority} onChange={(e) => setMemberPriority(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Weight</Label>
                <Input type="number" value={memberWeight} onChange={(e) => setMemberWeight(e.target.value)} />
              </div>
            </div>

            <Button
              disabled={!memberConnectorId || addMemberMutation.isPending}
              onClick={() => addMemberMutation.mutate()}
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar/Atualizar membro
            </Button>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Connector</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Weight</TableHead>
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

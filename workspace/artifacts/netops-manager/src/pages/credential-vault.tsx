import { useMemo, useState } from "react";
import { KeyRound, Plus, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useListDevices } from "@workspace/api-client-react";
import { listTenants } from "@/features/connectors/connectors-api";
import {
  assignCredential,
  createCredentialProfile,
  deleteCredentialProfile,
  listCredentialAssignments,
  listCredentialProfiles,
  removeCredentialAssignment,
  rotateCredentialProfile,
  testCredential,
  updateCredentialProfile,
  type CredentialProfile,
  type CredentialType,
} from "@/features/credentials/credential-vault-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";

const credentialTypes: CredentialType[] = ["SSH", "SNMP_V2", "SNMP_V3", "NETCONF", "API_TOKEN"];

function emptyForm() {
  return {
    id: "",
    tenant_id: "",
    name: "",
    type: "SSH" as CredentialType,
    vendor: "huawei",
    username: "",
    secret: "",
  };
}

export default function CredentialVaultPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canWrite = user?.role === "admin" || user?.role === "operator";
  const [form, setForm] = useState(emptyForm());
  const [assignmentDevice, setAssignmentDevice] = useState("");
  const [assignmentProfile, setAssignmentProfile] = useState("");
  const [priority, setPriority] = useState("100");
  const [rotateSecret, setRotateSecret] = useState<Record<string, string>>({});
  const [testDevice, setTestDevice] = useState<Record<string, string>>({});

  const profilesQuery = useQuery({ queryKey: ["credential-profiles"], queryFn: listCredentialProfiles });
  const assignmentsQuery = useQuery({ queryKey: ["credential-assignments"], queryFn: () => listCredentialAssignments() });
  const tenantsQuery = useQuery({ queryKey: ["connectors-tenants"], queryFn: listTenants });
  const devicesQuery = useListDevices();

  const profiles = profilesQuery.data ?? [];
  const devices = devicesQuery.data ?? [];
  const sshProfiles = useMemo(() => profiles.filter((p) => p.type === "SSH" || p.type === "NETCONF"), [profiles]);

  const createMutation = useMutation({
    mutationFn: () =>
      createCredentialProfile({
        id: form.id || undefined,
        tenant_id: Number(form.tenant_id),
        name: form.name,
        type: form.type,
        vendor: form.vendor || undefined,
        username: form.username || undefined,
        secret: form.secret,
      }),
    onSuccess: () => {
      setForm(emptyForm());
      void queryClient.invalidateQueries({ queryKey: ["credential-profiles"] });
      toast({ title: "Credencial criada" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      assignCredential({
        device_id: Number(assignmentDevice),
        credential_profile_id: assignmentProfile,
        priority: Number(priority) || 100,
      }),
    onSuccess: () => {
      setAssignmentDevice("");
      setAssignmentProfile("");
      void queryClient.invalidateQueries({ queryKey: ["credential-assignments"] });
      toast({ title: "Credencial atribuída" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: ({ deviceId, profileId }: { deviceId: number; profileId: string }) =>
      removeCredentialAssignment(deviceId, profileId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["credential-assignments"] });
      toast({ title: "Assignment removido" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (profile: CredentialProfile) => updateCredentialProfile(profile.id, { is_active: !profile.is_active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["credential-profiles"] }),
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCredentialProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["credential-profiles"] });
      void queryClient.invalidateQueries({ queryKey: ["credential-assignments"] });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const rotateMutation = useMutation({
    mutationFn: ({ id, secret }: { id: string; secret: string }) => rotateCredentialProfile(id, secret),
    onSuccess: (_data, vars) => {
      setRotateSecret((state) => ({ ...state, [vars.id]: "" }));
      void queryClient.invalidateQueries({ queryKey: ["credential-profiles"] });
      toast({ title: "Credencial rotacionada" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: ({ id, deviceId }: { id: string; deviceId: number }) => testCredential(id, deviceId),
    onSuccess: (data) => toast({ title: data.success ? "Teste OK" : "Teste falhou", description: data.message }),
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-primary" />
            Credential Vault
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Jobs de connector guardam apenas <span className="font-mono">credential_id</span>; o segredo é resolvido no servidor durante a execução.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void profilesQuery.refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {canWrite && (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Novo profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <Input placeholder="cred-huawei-prod" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} />
              <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.tenant_id} onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}>
                <option value="">Tenant</option>
                {(tenantsQuery.data ?? []).map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
              </select>
              <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CredentialType })}>
                {credentialTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <Input placeholder="Huawei produção" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
              <Input placeholder="username (SSH/NETCONF)" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              <Input className="md:col-span-2" type="password" placeholder="segredo" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
              <Button disabled={!form.tenant_id || !form.name || !form.secret || createMutation.isPending} onClick={() => createMutation.mutate()}>
                <Plus className="h-4 w-4 mr-2" />
                Criar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Atribuir a device</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={assignmentDevice} onChange={(e) => setAssignmentDevice(e.target.value)}>
                <option value="">Device</option>
                {devices.map((device) => <option key={device.id} value={device.id}>{device.hostname}</option>)}
              </select>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={assignmentProfile} onChange={(e) => setAssignmentProfile(e.target.value)}>
                <option value="">Credential profile</option>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} ({profile.type})</option>)}
              </select>
              <div className="flex gap-2">
                <Input value={priority} onChange={(e) => setPriority(e.target.value)} />
                <Button disabled={!assignmentDevice || !assignmentProfile || assignMutation.isPending} onClick={() => assignMutation.mutate()}>
                  Atribuir
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profiles</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rotação / teste</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell className="font-mono text-xs">{profile.id}</TableCell>
                  <TableCell>{profile.name}</TableCell>
                  <TableCell><Badge variant="outline">{profile.type}</Badge></TableCell>
                  <TableCell>{profile.tenant_name ?? profile.tenant_id}</TableCell>
                  <TableCell>{profile.username ?? "—"}</TableCell>
                  <TableCell><Badge variant={profile.is_active ? "default" : "secondary"}>{profile.is_active ? "ativo" : "inativo"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Input className="w-40" type="password" placeholder="novo segredo" value={rotateSecret[profile.id] ?? ""} onChange={(e) => setRotateSecret((state) => ({ ...state, [profile.id]: e.target.value }))} />
                      <Button variant="outline" size="sm" disabled={!rotateSecret[profile.id]} onClick={() => rotateMutation.mutate({ id: profile.id, secret: rotateSecret[profile.id] })}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <select className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm" value={testDevice[profile.id] ?? ""} onChange={(e) => setTestDevice((state) => ({ ...state, [profile.id]: e.target.value }))}>
                        <option value="">Device teste</option>
                        {devices.map((device) => <option key={device.id} value={device.id}>{device.hostname}</option>)}
                      </select>
                      <Button variant="outline" size="sm" disabled={!testDevice[profile.id]} onClick={() => testMutation.mutate({ id: profile.id, deviceId: Number(testDevice[profile.id]) })}>
                        <ShieldCheck className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite && (
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => toggleMutation.mutate(profile)}>
                          {profile.is_active ? "Desativar" : "Ativar"}
                        </Button>
                        {user?.role === "admin" && (
                          <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(profile.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!profilesQuery.isLoading && profiles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhum profile cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Credential</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(assignmentsQuery.data ?? []).map((assignment) => (
                <TableRow key={`${assignment.device_id}-${assignment.credential_profile_id}`}>
                  <TableCell>{assignment.device_hostname ?? assignment.device_id}</TableCell>
                  <TableCell className="font-mono text-xs">{assignment.credential_profile_id}</TableCell>
                  <TableCell>{assignment.credential_type}</TableCell>
                  <TableCell>{assignment.priority}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(assignment.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {canWrite ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          removeAssignmentMutation.mutate({
                            deviceId: assignment.device_id,
                            profileId: assignment.credential_profile_id,
                          })
                        }
                      >
                        Remover
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {sshProfiles.length === 0 ? <p className="text-xs text-muted-foreground mt-3">Crie ao menos um profile SSH para testar devices sem username/password explícito nos jobs.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

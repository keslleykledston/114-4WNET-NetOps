import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "../components/auth-provider";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Lock, Unlock, RotateCcw, Trash2, Building2 } from "lucide-react";
import { Link } from "wouter";
import { listTenants } from "@/features/connectors/connectors-api";
import { useCreateUser, useDeleteUser, useDisableUser, useEnableUser, useListUsers, useResetUserPassword, useUpdateUser, getListUsersQueryKey } from "@workspace/api-client-react";
import type { CreateUserRequest, UpdateUserRequest } from "@workspace/api-client-react";

type UserRole = "viewer" | "operator" | "admin";
type ModuleKey = "devices" | "compliance" | "scheduler" | "integrations" | "users" | "audit" | "provisioning" | "bgp";
type ModulePermissions = {
  read?: boolean;
  write?: boolean;
  import?: boolean;
  export?: boolean;
  run?: boolean;
  cleanup?: { plan?: boolean };
};
type UserPermissions = Partial<Record<ModuleKey, ModulePermissions>>;

type UserRow = {
  id: number;
  tenantId: number | null;
  tenantName?: string | null;
  profileId: number | null;
  profileName?: string | null;
  profileDescription?: string | null;
  profilePermissionsJson?: UserPermissions | null;
  name: string;
  email: string;
  role: UserRole;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type AccessProfile = {
  id: number;
  tenantId: number | null;
  tenantName?: string | null;
  name: string;
  description: string | null;
  permissionsJson: UserPermissions;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

const GLOBAL_VALUE = "__global__";
const NO_PROFILE_VALUE = "__no_profile__";

const MODULES: Array<{ key: ModuleKey; label: string; description: string }> = [
  { key: "devices", label: "Devices", description: "Inventário, coleta e exportação" },
  { key: "compliance", label: "Compliance", description: "Leitura e execução" },
  { key: "scheduler", label: "Scheduler", description: "Jobs e agendamentos" },
  { key: "integrations", label: "Integrations", description: "Conectores e integrações" },
  { key: "users", label: "Users", description: "Gerência de usuários e perfis" },
  { key: "audit", label: "Audit", description: "Logs de auditoria" },
  { key: "provisioning", label: "Provisioning", description: "Prévia e execução" },
  { key: "bgp", label: "BGP", description: "Operações e drilldowns" },
];

function emptyPermissions(): UserPermissions {
  return Object.fromEntries(MODULES.map((module) => [module.key, {}])) as UserPermissions;
}

function defaultPermissionsForRole(role: UserRole): UserPermissions {
  if (role === "admin") {
    return {
      devices: { read: true, write: true, import: true, export: true },
      compliance: { read: true, run: true, export: true },
      scheduler: { read: true, write: true },
      integrations: { read: true, write: true },
      users: { read: true, write: true },
      audit: { read: true },
      provisioning: { read: true, write: true, export: true },
      bgp: { read: true, cleanup: { plan: true } },
    };
  }
  if (role === "operator") {
    return {
      devices: { read: true, write: true, import: true, export: true },
      compliance: { read: true, run: true, export: true },
      scheduler: { read: true, write: true },
      integrations: { read: true },
      users: { read: true },
      audit: { read: true },
      provisioning: { read: true, write: true, export: true },
      bgp: { read: true, cleanup: { plan: true } },
    };
  }
  return {
    devices: { read: true, export: true },
    compliance: { read: true },
    scheduler: { read: true },
    integrations: { read: true },
    users: { read: true },
    audit: { read: true },
    provisioning: { read: true, export: true },
    bgp: { read: false },
  };
}

function visibleModules(permissions?: UserPermissions | null): string[] {
  return MODULES.filter((module) => permissions?.[module.key]?.read).map((module) => module.label);
}

function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return fetch(path, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  }).then(async (response) => {
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const data = await response.json() as { error?: string };
        if (data.error) message = data.error;
      } catch {
        // ignore
      }
      throw new Error(message);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  });
}

function useUserProfiles() {
  return useQuery({
    queryKey: ["user-profiles"],
    queryFn: () => apiFetch<{ items: AccessProfile[] }>("/api/user-profiles"),
    select: (data) => data.items,
  });
}

export default function UsersPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: usersResponse } = useListUsers();
  const users = (usersResponse?.items ?? []) as UserRow[];
  const tenantsQuery = useQuery({ queryKey: ["users-tenants"], queryFn: listTenants });
  const profilesQuery = useUserProfiles();

  const [activeTab, setActiveTab] = useState<"crud" | "profiles">("crud");
  const [tenantFilter, setTenantFilter] = useState("ALL");
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [createProfileOpen, setCreateProfileOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<AccessProfile | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "disable" | "enable" | "delete" | "reset"; userId: number; userName: string } | null>(null);

  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", role: "viewer" as UserRole, tenantId: "", profileId: "" });
  const [profileForm, setProfileForm] = useState({
    tenantId: "",
    name: "",
    description: "",
    isDefault: false,
    permissionsJson: emptyPermissions(),
  });

  useEffect(() => {
    if (user && user.role !== "admin") {
      setLocation("/devices");
    }
  }, [user, setLocation]);

  useEffect(() => {
    if (!createUserOpen) return;
    setUserForm((current) => ({ ...current, profileId: "" }));
  }, [createUserOpen]);

  useEffect(() => {
    if (!editUser) return;
    setUserForm({
      name: editUser.name,
      email: editUser.email,
      password: "",
      role: editUser.role,
      tenantId: editUser.tenantId == null ? "" : String(editUser.tenantId),
      profileId: editUser.profileId == null ? "" : String(editUser.profileId),
    });
  }, [editUser]);

  useEffect(() => {
    if (!editProfile) return;
    setProfileForm({
      tenantId: editProfile.tenantId == null ? "" : String(editProfile.tenantId),
      name: editProfile.name,
      description: editProfile.description ?? "",
      isDefault: editProfile.isDefault,
      permissionsJson: editProfile.permissionsJson,
    });
  }, [editProfile]);

  const createUserMutation = useCreateUser({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setCreateUserOpen(false);
        setUserForm({ name: "", email: "", password: "", role: "viewer", tenantId: "", profileId: "" });
      },
    },
  });

  const updateUserMutation = useUpdateUser({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setEditUser(null);
      },
    },
  });

  const disableMutation = useDisableUser({
    mutation: { onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }); setConfirmAction(null); } },
  });
  const enableMutation = useEnableUser({
    mutation: { onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }); setConfirmAction(null); } },
  });
  const resetPasswordMutation = useResetUserPassword({
    mutation: { onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }); setConfirmAction(null); } },
  });
  const deleteUserMutation = useDeleteUser({
    mutation: { onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }); setConfirmAction(null); } },
  });

  const createProfileMutation = useMutation({
    mutationFn: (data: { tenantId: number | null; name: string; description: string | null; isDefault: boolean; permissionsJson: UserPermissions }) =>
      apiFetch<AccessProfile>("/api/user-profiles", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user-profiles"] });
      setCreateProfileOpen(false);
      setProfileForm({ tenantId: "", name: "", description: "", isDefault: false, permissionsJson: emptyPermissions() });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { tenantId: number | null; name: string; description: string | null; isDefault: boolean; permissionsJson: UserPermissions } }) =>
      apiFetch<AccessProfile>(`/api/user-profiles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user-profiles"] });
      setEditProfile(null);
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/api/user-profiles/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user-profiles"] });
      await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    },
  });

  if (!user || user.role !== "admin") {
    return null;
  }

  const filteredProfiles = tenantFilter === "ALL"
    ? (profilesQuery.data ?? [])
    : (profilesQuery.data ?? []).filter((profile) => String(profile.tenantId ?? "") === tenantFilter);

  const tenantProfilesForUser = useMemo(() => {
    if (!userForm.tenantId) return (profilesQuery.data ?? []).filter((profile) => profile.tenantId == null);
    return (profilesQuery.data ?? []).filter((profile) => String(profile.tenantId ?? "") === userForm.tenantId);
  }, [profilesQuery.data, userForm.tenantId]);

  const editTenantProfiles = useMemo(() => {
    if (!userForm.tenantId) return (profilesQuery.data ?? []).filter((profile) => profile.tenantId == null);
    return (profilesQuery.data ?? []).filter((profile) => String(profile.tenantId ?? "") === userForm.tenantId);
  }, [profilesQuery.data, userForm.tenantId]);

  const visibleCount = filteredProfiles.length;
  const defaultCount = filteredProfiles.filter((profile) => profile.isDefault).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Usuários e Perfis</h1>
          <p className="text-sm text-muted-foreground">Perfil define módulos; usuário seleciona um perfil; admin acessa tudo.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/tenants">
              <Building2 className="h-4 w-4 mr-2" />
              Gestão de Tenants
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setCreateProfileOpen(true)}>Criar perfil</Button>
          <Button onClick={() => setCreateUserOpen(true)}>Criar usuário</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "crud" | "profiles")} className="space-y-6">
        <TabsList>
          <TabsTrigger value="crud">CRUD</TabsTrigger>
          <TabsTrigger value="profiles">Perfis por tenant</TabsTrigger>
        </TabsList>

        <TabsContent value="crud" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Usuários</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4">Nome</th>
                    <th className="text-left py-2 px-4">Email</th>
                    <th className="text-left py-2 px-4">Tenant</th>
                    <th className="text-left py-2 px-4">Perfil</th>
                    <th className="text-left py-2 px-4">Status</th>
                    <th className="text-left py-2 px-4">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-4">
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs text-muted-foreground">{row.email}</div>
                      </td>
                      <td className="py-2 px-4">{row.email}</td>
                      <td className="py-2 px-4 text-sm text-muted-foreground">{row.tenantName ?? (row.tenantId ?? "Global")}</td>
                      <td className="py-2 px-4">
                        <div className="space-y-1">
                          <Badge variant="outline">{row.profileName ?? "Sem perfil"}</Badge>
                          {row.profileDescription ? <div className="text-xs text-muted-foreground">{row.profileDescription}</div> : null}
                        </div>
                      </td>
                      <td className="py-2 px-4">
                        {row.enabled ? <Badge variant="outline" className="bg-green-500/10">Enabled</Badge> : <Badge variant="outline" className="bg-red-500/10">Disabled</Badge>}
                      </td>
                      <td className="py-2 px-4">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEditUser(row)}>Editar</Button>
                          {row.enabled ? (
                            <Button size="sm" variant="outline" onClick={() => setConfirmAction({ type: "disable", userId: row.id, userName: row.name })}><Lock className="h-4 w-4" /></Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setConfirmAction({ type: "enable", userId: row.id, userName: row.name })}><Unlock className="h-4 w-4" /></Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setConfirmAction({ type: "reset", userId: row.id, userName: row.name })}><RotateCcw className="h-4 w-4" /></Button>
                          <Button size="sm" variant="outline" onClick={() => setConfirmAction({ type: "delete", userId: row.id, userName: row.name })}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profiles" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Perfis de acesso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Perfis no filtro</div>
                  <div className="text-lg font-semibold">{visibleCount}</div>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Perfis default</div>
                  <div className="text-lg font-semibold">{defaultCount}</div>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Tenants</div>
                  <div className="text-lg font-semibold">{(tenantsQuery.data ?? []).length}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2 min-w-60">
                  <Label>Tenant</Label>
                  <Select value={tenantFilter === "" ? GLOBAL_VALUE : tenantFilter} onValueChange={(value) => setTenantFilter(value === GLOBAL_VALUE ? "" : value)}>
                    <SelectTrigger><SelectValue placeholder="Filtrar tenant" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos</SelectItem>
                      <SelectItem value={GLOBAL_VALUE}>Global</SelectItem>
                      {(tenantsQuery.data ?? []).map((tenant: { id: number; name: string }) => (
                        <SelectItem key={tenant.id} value={String(tenant.id)}>{tenant.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-sm text-muted-foreground">
                  Perfil define módulos liberados. Usuário escolhe perfil no cadastro. Admin ignora restrições.
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-4">Tenant</th>
                      <th className="text-left py-2 px-4">Perfil</th>
                      <th className="text-left py-2 px-4">Módulos</th>
                      <th className="text-left py-2 px-4">Default</th>
                      <th className="text-left py-2 px-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProfiles.map((profile) => (
                      <tr key={profile.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-4 text-sm">{profile.tenantName ?? (profile.tenantId ?? "Global")}</td>
                        <td className="py-2 px-4">
                          <div className="font-medium">{profile.name}</div>
                          {profile.description ? <div className="text-xs text-muted-foreground">{profile.description}</div> : null}
                        </td>
                        <td className="py-2 px-4">
                          <div className="flex flex-wrap gap-2">
                            {visibleModules(profile.permissionsJson).slice(0, 3).map((label) => <Badge key={label} variant="secondary">{label}</Badge>)}
                            {visibleModules(profile.permissionsJson).length > 3 ? <Badge variant="outline">+{visibleModules(profile.permissionsJson).length - 3}</Badge> : null}
                            {visibleModules(profile.permissionsJson).length === 0 ? <Badge variant="outline">Sem módulos</Badge> : null}
                          </div>
                        </td>
                        <td className="py-2 px-4">{profile.isDefault ? <Badge>Default</Badge> : <Badge variant="outline">-</Badge>}</td>
                        <td className="py-2 px-4">
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => setEditProfile(profile)}>Editar</Button>
                            <Button size="sm" variant="outline" onClick={() => deleteProfileMutation.mutate(profile.id)} disabled={deleteProfileMutation.isPending}>Excluir</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredProfiles.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Nenhum perfil neste filtro.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={userForm.name} onChange={(e) => setUserForm((current) => ({ ...current, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={userForm.email} onChange={(e) => setUserForm((current) => ({ ...current, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input type="password" value={userForm.password} onChange={(e) => setUserForm((current) => ({ ...current, password: e.target.value }))} />
            </div>
              <div className="space-y-2">
                <Label>Tenant</Label>
              <Select value={userForm.tenantId || GLOBAL_VALUE} onValueChange={(tenantId) => setUserForm((current) => ({ ...current, tenantId: tenantId === GLOBAL_VALUE ? "" : tenantId, profileId: "" }))}>
                <SelectTrigger><SelectValue placeholder="Escolher tenant" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={GLOBAL_VALUE}>Global</SelectItem>
                  {(tenantsQuery.data ?? []).map((tenant: { id: number; name: string }) => (
                    <SelectItem key={tenant.id} value={String(tenant.id)}>{tenant.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
              <div className="space-y-2">
                <Label>Perfil</Label>
                <Select
                value={userForm.profileId || NO_PROFILE_VALUE}
                onValueChange={(profileId) => setUserForm((current) => ({ ...current, profileId: profileId === NO_PROFILE_VALUE ? "" : profileId }))}
                disabled={userForm.role === "admin"}
              >
                <SelectTrigger><SelectValue placeholder={userForm.role === "admin" ? "Admin acessa tudo" : "Selecionar perfil"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROFILE_VALUE}>Sem perfil</SelectItem>
                  {tenantProfilesForUser.map((profile) => (
                    <SelectItem key={profile.id} value={String(profile.id)}>
                      {profile.name}{profile.isDefault ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Admin ignora o perfil e acessa tudo.</p>
            </div>
            <div className="space-y-2">
              <Label>Perfil de login</Label>
              <Select value={userForm.role} onValueChange={(role) => setUserForm((current) => ({ ...current, role: role as UserRole, profileId: role === "admin" ? "" : current.profileId }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => createUserMutation.mutate({
                data: {
                  name: userForm.name,
                  email: userForm.email,
                  password: userForm.password,
                  role: userForm.role,
                  tenantId: userForm.tenantId ? Number(userForm.tenantId) : null,
                  profileId: userForm.profileId ? Number(userForm.profileId) : null,
                } as CreateUserRequest,
              })}
              disabled={createUserMutation.isPending}
            >
              {createUserMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Criar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {editUser ? (
        <Dialog open={Boolean(editUser)} onOpenChange={(open) => !open && setEditUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={userForm.name} onChange={(e) => setUserForm((current) => ({ ...current, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={userForm.email} onChange={(e) => setUserForm((current) => ({ ...current, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Tenant</Label>
                <Select value={userForm.tenantId || GLOBAL_VALUE} onValueChange={(tenantId) => setUserForm((current) => ({ ...current, tenantId: tenantId === GLOBAL_VALUE ? "" : tenantId, profileId: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Escolher tenant" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GLOBAL_VALUE}>Global</SelectItem>
                    {(tenantsQuery.data ?? []).map((tenant: { id: number; name: string }) => (
                      <SelectItem key={tenant.id} value={String(tenant.id)}>{tenant.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Perfil</Label>
                <Select value={userForm.profileId || NO_PROFILE_VALUE} onValueChange={(profileId) => setUserForm((current) => ({ ...current, profileId: profileId === NO_PROFILE_VALUE ? "" : profileId }))} disabled={userForm.role === "admin"}>
                  <SelectTrigger><SelectValue placeholder={userForm.role === "admin" ? "Admin acessa tudo" : "Selecionar perfil"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROFILE_VALUE}>Sem perfil</SelectItem>
                    {editTenantProfiles.map((profile) => (
                      <SelectItem key={profile.id} value={String(profile.id)}>
                        {profile.name}{profile.isDefault ? " (default)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Perfil de login</Label>
                <Select value={userForm.role} onValueChange={(role) => setUserForm((current) => ({ ...current, role: role as UserRole, profileId: role === "admin" ? "" : current.profileId }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => updateUserMutation.mutate({
                  id: editUser.id,
                  data: {
                    name: userForm.name,
                    email: userForm.email,
                    role: userForm.role,
                    tenantId: userForm.tenantId ? Number(userForm.tenantId) : null,
                    profileId: userForm.profileId ? Number(userForm.profileId) : null,
                  } as UpdateUserRequest,
                })}
                disabled={updateUserMutation.isPending}
              >
                {updateUserMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      <Dialog open={createProfileOpen || Boolean(editProfile)} onOpenChange={(open) => { if (!open) { setCreateProfileOpen(false); setEditProfile(null); } }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editProfile ? "Editar perfil" : "Criar perfil"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Tenant</Label>
                <Select value={profileForm.tenantId || GLOBAL_VALUE} onValueChange={(tenantId) => setProfileForm((current) => ({ ...current, tenantId: tenantId === GLOBAL_VALUE ? "" : tenantId }))}>
                  <SelectTrigger><SelectValue placeholder="Global" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GLOBAL_VALUE}>Global</SelectItem>
                    {(tenantsQuery.data ?? []).map((tenant: { id: number; name: string }) => (
                      <SelectItem key={tenant.id} value={String(tenant.id)}>{tenant.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nome do perfil</Label>
                <Input value={profileForm.name} onChange={(e) => setProfileForm((current) => ({ ...current, name: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={profileForm.description} onChange={(e) => setProfileForm((current) => ({ ...current, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Módulos liberados</Label>
              <div className="grid gap-3 md:grid-cols-2">
                {MODULES.map((module) => {
                  const checked = Boolean(profileForm.permissionsJson[module.key]?.read);
                  return (
                    <label key={module.key} className="flex items-start gap-3 rounded-md border p-3">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          const next = Boolean(value);
                          setProfileForm((current) => ({
                            ...current,
                            permissionsJson: {
                              ...current.permissionsJson,
                              [module.key]: { ...(current.permissionsJson[module.key] ?? {}), read: next },
                            },
                          }));
                        }}
                      />
                      <span>
                        <span className="block text-sm font-medium">{module.label}</span>
                        <span className="block text-xs text-muted-foreground">{module.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={profileForm.isDefault} onCheckedChange={(value) => setProfileForm((current) => ({ ...current, isDefault: Boolean(value) }))} />
              <span className="text-sm">Marcar como perfil default deste tenant</span>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  const payload = {
                    tenantId: profileForm.tenantId ? Number(profileForm.tenantId) : null,
                    name: profileForm.name,
                    description: profileForm.description.trim() || null,
                    isDefault: profileForm.isDefault,
                    permissionsJson: profileForm.permissionsJson,
                  };
                  if (editProfile) {
                    updateProfileMutation.mutate({ id: editProfile.id, data: payload });
                  } else {
                    createProfileMutation.mutate(payload);
                  }
                }}
                disabled={createProfileMutation.isPending || updateProfileMutation.isPending}
              >
                {createProfileMutation.isPending || updateProfileMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar perfil
              </Button>
              <Button variant="outline" onClick={() => setProfileForm({ tenantId: "", name: "", description: "", isDefault: false, permissionsJson: emptyPermissions() })}>
                Limpar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmAction != null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "disable" && "Desativar usuário?"}
              {confirmAction?.type === "enable" && "Ativar usuário?"}
              {confirmAction?.type === "reset" && "Resetar senha?"}
              {confirmAction?.type === "delete" && "Excluir usuário?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "disable" && `Desativar ${confirmAction.userName}?`}
              {confirmAction?.type === "enable" && `Ativar ${confirmAction.userName}?`}
              {confirmAction?.type === "reset" && `Resetar senha de ${confirmAction.userName}?`}
              {confirmAction?.type === "delete" && `Excluir ${confirmAction.userName}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!confirmAction) return;
              if (confirmAction.type === "disable") disableMutation.mutate({ id: confirmAction.userId });
              if (confirmAction.type === "enable") enableMutation.mutate({ id: confirmAction.userId });
              if (confirmAction.type === "delete") deleteUserMutation.mutate({ id: confirmAction.userId });
              if (confirmAction.type === "reset") {
                const nextPassword = prompt("Nova senha (mínimo 8 caracteres):");
                if (nextPassword && nextPassword.length >= 8) {
                  resetPasswordMutation.mutate({ id: confirmAction.userId, data: { password: nextPassword } });
                }
              }
            }}
          >
            Confirmar
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

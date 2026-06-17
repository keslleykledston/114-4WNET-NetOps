import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { NAV_MODULE_DEFINITIONS, type NavModulesMap } from "@/features/user-profiles/nav-modules";
import {
  useCreateUserProfile,
  useDeleteUserProfile,
  useUpdateUserProfile,
  useUserProfiles,
  type UserProfile,
} from "@/features/user-profiles/user-profiles-api";

function emptyModulesMap(): NavModulesMap {
  return Object.fromEntries(NAV_MODULE_DEFINITIONS.map((item) => [item.id, false]));
}

function countEnabledModules(modules: NavModulesMap): number {
  return Object.values(modules).filter(Boolean).length;
}

function ModuleCheckboxGrid({
  modules,
  onChange,
  readOnly,
}: {
  modules: NavModulesMap;
  onChange: (next: NavModulesMap) => void;
  readOnly?: boolean;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, typeof NAV_MODULE_DEFINITIONS>();
    for (const item of NAV_MODULE_DEFINITIONS) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
      {groups.map(([group, items]) => (
        <div key={group} className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((item) => (
              <label key={item.id} className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                <Checkbox
                  checked={modules[item.id] === true}
                  disabled={readOnly}
                  onCheckedChange={(checked) => onChange({ ...modules, [item.id]: checked === true })}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function UserProfilesPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data, isLoading } = useUserProfiles(user?.role === "admin");
  const createMutation = useCreateUserProfile();
  const updateMutation = useUpdateUserProfile();
  const deleteMutation = useDeleteUserProfile();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formModules, setFormModules] = useState<NavModulesMap>(emptyModulesMap());

  const profiles = data?.items ?? [];
  const isAdminProfile = editing?.slug === "admin";

  useEffect(() => {
    if (user && user.role !== "admin") {
      setLocation("/devices");
    }
  }, [user, setLocation]);

  if (!user || user.role !== "admin") {
    return null;
  }

  function openCreate() {
    setEditing(null);
    setFormName("");
    setFormDescription("");
    setFormModules(emptyModulesMap());
    setEditorOpen(true);
  }

  function openEdit(profile: UserProfile) {
    setEditing(profile);
    setFormName(profile.name);
    setFormDescription(profile.description ?? "");
    setFormModules({ ...profile.modules });
    setEditorOpen(true);
  }

  function handleSave() {
    if (!formName.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }

    if (editing) {
      updateMutation.mutate(
        {
          id: editing.id,
          data: {
            name: formName.trim(),
            description: formDescription.trim(),
            modules: isAdminProfile ? undefined : formModules,
          },
        },
        {
          onSuccess: () => {
            toast({ title: "Perfil atualizado" });
            setEditorOpen(false);
          },
          onError: (error) => {
            toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
          },
        },
      );
      return;
    }

    createMutation.mutate(
      { name: formName.trim(), description: formDescription.trim(), modules: formModules },
      {
        onSuccess: () => {
          toast({ title: "Perfil criado" });
          setEditorOpen(false);
        },
        onError: (error) => {
          toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
        },
      },
    );
  }

  function handleDelete(profile: UserProfile) {
    if (profile.isSystem) return;
    if (!window.confirm(`Excluir perfil "${profile.name}"?`)) return;
    deleteMutation.mutate(profile.id, {
      onSuccess: () => toast({ title: "Perfil excluído" }),
      onError: (error) => toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Perfis de usuário</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Controle quais módulos aparecem no menu lateral. Usuários <strong>admin</strong> sempre veem tudo.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo perfil
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Perfis cadastrados</CardTitle>
          <CardDescription>Atribua um perfil ao criar/editar usuários em Usuários.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando perfis...</p>}
          {!isLoading && profiles.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum perfil encontrado.</p>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {profiles.map((profile) => (
              <div key={profile.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {profile.name}
                      {profile.isSystem && <Badge variant="outline">Sistema</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{profile.slug}</div>
                  </div>
                  {profile.slug === "admin" && <Shield className="h-4 w-4 text-primary shrink-0" />}
                </div>
                {profile.description ? (
                  <p className="text-sm text-muted-foreground">{profile.description}</p>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  {profile.slug === "admin"
                    ? "Todos os módulos habilitados"
                    : `${countEnabledModules(profile.modules)} módulos habilitados`}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(profile)}>
                    <Pencil className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  {!profile.isSystem && (
                    <Button size="sm" variant="outline" onClick={() => handleDelete(profile)}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Excluir
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar perfil" : "Novo perfil"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} disabled={isAdminProfile} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Descrição</Label>
                <Textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  disabled={isAdminProfile}
                />
              </div>
            </div>

            {isAdminProfile ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                Perfil Administrador: todos os módulos permanecem habilitados e não podem ser alterados.
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Módulos visíveis no menu</Label>
                <ModuleCheckboxGrid modules={formModules} onChange={setFormModules} />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditorOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

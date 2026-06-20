import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  createTenant,
  deleteTenant,
  listTenants,
  updateTenant,
  type TenantDetail,
  type TenantStatus,
} from "@/features/tenants/tenants-api";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  return status === "active" ? "default" : "secondary";
}

function emptyForm() {
  return { name: "", slug: "", status: "active" as TenantStatus };
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return value;
  }
}

export default function TenantsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<TenantDetail | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantDetail | null>(null);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    if (user && user.role !== "admin") {
      setLocation("/devices");
    }
  }, [user, setLocation]);

  const tenantsQuery = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: listTenants,
    enabled: user?.role === "admin",
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createTenant({
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        status: form.status,
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setForm(emptyForm());
      await queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
      await queryClient.invalidateQueries({ queryKey: ["connectors-tenants"] });
      toast({ title: "Tenant criado" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateTenant(editTenant!.id, {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        status: form.status,
      }),
    onSuccess: async () => {
      setEditTenant(null);
      setForm(emptyForm());
      await queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
      await queryClient.invalidateQueries({ queryKey: ["connectors-tenants"] });
      toast({ title: "Tenant atualizado" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTenant(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
      await queryClient.invalidateQueries({ queryKey: ["connectors-tenants"] });
      toast({ title: "Tenant excluído" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!editTenant) return;
    setForm({
      name: editTenant.name,
      slug: editTenant.slug,
      status: editTenant.status,
    });
  }, [editTenant]);

  const totals = useMemo(() => {
    const items = tenantsQuery.data ?? [];
    return {
      tenants: items.length,
      connectors: items.reduce((sum, item) => sum + item.connector_count, 0),
      users: items.reduce((sum, item) => sum + item.user_count, 0),
    };
  }, [tenantsQuery.data]);

  if (user?.role !== "admin") {
    return null;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Gestão de Tenants
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize conectores, usuários e perfis por tenant na plataforma.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void tenantsQuery.refetch()} disabled={tenantsQuery.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${tenantsQuery.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => { setForm(emptyForm()); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo tenant
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tenants</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{totals.tenants}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Connectors</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{totals.connectors}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Usuários vinculados</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{totals.users}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenants cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {tenantsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando tenants...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Connectors</TableHead>
                  <TableHead className="text-right">Usuários</TableHead>
                  <TableHead className="text-right">Perfis</TableHead>
                  <TableHead>Atualizado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tenantsQuery.data ?? []).map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="font-mono text-xs">{tenant.slug}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(tenant.status)}>{tenant.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{tenant.connector_count}</TableCell>
                    <TableCell className="text-right">{tenant.user_count}</TableCell>
                    <TableCell className="text-right">{tenant.profile_count}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(tenant.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditTenant(tenant)} aria-label={`Editar ${tenant.name}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(tenant)}
                          aria-label={`Excluir ${tenant.name}`}
                          disabled={tenant.connector_count > 0}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(tenantsQuery.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      Nenhum tenant cadastrado.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tenant-name">Nome</Label>
              <Input
                id="tenant-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ex.: 4WNET BVA"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-slug">Slug (opcional)</Label>
              <Input
                id="tenant-slug"
                value={form.slug}
                onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
                placeholder="Gerado automaticamente a partir do nome"
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as TenantStatus }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={() => createMutation.mutate()} disabled={!form.name.trim() || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTenant)} onOpenChange={(open) => { if (!open) setEditTenant(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-tenant-name">Nome</Label>
              <Input
                id="edit-tenant-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-tenant-slug">Slug</Label>
              <Input
                id="edit-tenant-slug"
                value={form.slug}
                onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as TenantStatus }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditTenant(null)}>Cancelar</Button>
              <Button onClick={() => updateMutation.mutate()} disabled={!form.name.trim() || updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tenant?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `O tenant "${deleteTarget.name}" será removido permanentemente. Perfis e credenciais vinculados também serão excluídos.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            disabled={deleteMutation.isPending}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

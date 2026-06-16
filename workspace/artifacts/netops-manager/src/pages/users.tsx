import { useEffect, useState } from "react";
import { useAuth } from "../components/auth-provider";
import { useLocation } from "wouter";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useDisableUser,
  useEnableUser,
  useResetUserPassword,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import type { CreateUserRequest, UpdateUserRequest, User } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Loader2, Lock, Unlock, RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isEmailTaken(users: User[], email: string, excludeUserId?: number): boolean {
  const normalized = normalizeEmail(email);
  return users.some((entry) => entry.id !== excludeUserId && entry.email.toLowerCase() === normalized);
}

function mutationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.replace(/^HTTP \d+ [^:]+:\s*/, "");
  }
  return "Operação falhou";
}

export default function UsersPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "disable" | "enable" | "delete" | null;
    userId?: number;
    userName?: string;
  }>({ type: null });
  const [resetTarget, setResetTarget] = useState<{ userId: number; userName: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");

  const [formData, setFormData] = useState({ name: "", email: "", password: "", role: "viewer" });

  useEffect(() => {
    if (user && user.role !== "admin") {
      setLocation("/devices");
    }
  }, [user, setLocation]);

  const { data: usersResponse } = useListUsers();
  const users = usersResponse?.items ?? [];

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setFormData({ name: "", email: "", password: "", role: "viewer" });
        setIsCreateOpen(false);
        toast({ title: "Usuário criado" });
      },
      onError: (error) => {
        toast({
          title: "Erro ao criar usuário",
          description: mutationErrorMessage(error),
          variant: "destructive",
        });
      },
    },
  });

  const updateMutation = useUpdateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setEditingUser(null);
        toast({ title: "Usuário atualizado" });
      },
      onError: (error) => {
        toast({
          title: "Erro ao atualizar usuário",
          description: mutationErrorMessage(error),
          variant: "destructive",
        });
      },
    },
  });

  const disableMutation = useDisableUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setConfirmAction({ type: null });
      },
    },
  });

  const enableMutation = useEnableUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setConfirmAction({ type: null });
      },
    },
  });

  const resetPasswordMutation = useResetUserPassword({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setResetTarget(null);
        setResetPassword("");
        setResetPasswordConfirm("");
        toast({ title: "Senha redefinida", description: "O usuário deve usar a nova senha no próximo login." });
      },
      onError: (error) => {
        toast({
          title: "Erro ao redefinir senha",
          description: mutationErrorMessage(error),
          variant: "destructive",
        });
      },
    },
  });

  const deleteMutation = useDeleteUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setConfirmAction({ type: null });
      },
    },
  });

  function handleCreateUser() {
    const email = normalizeEmail(formData.email);
    if (!formData.name.trim() || !email || !formData.password) {
      toast({
        title: "Campos obrigatórios",
        description: "Nome, e-mail e senha são obrigatórios.",
        variant: "destructive",
      });
      return;
    }
    if (isEmailTaken(users, email)) {
      toast({
        title: "E-mail em uso",
        description: "Já existe um usuário com este e-mail.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({
      data: { ...formData, email } as CreateUserRequest,
    });
  }

  function handleUpdateUser() {
    if (!editingUser) return;
    const email = normalizeEmail(editingUser.email);
    if (!editingUser.name.trim() || !email) {
      toast({
        title: "Campos obrigatórios",
        description: "Nome e e-mail são obrigatórios.",
        variant: "destructive",
      });
      return;
    }
    if (isEmailTaken(users, email, editingUser.id)) {
      toast({
        title: "E-mail em uso",
        description: "Já existe outro usuário com este e-mail.",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({
      id: editingUser.id,
      data: {
        name: editingUser.name.trim(),
        email,
        role: editingUser.role,
      } as UpdateUserRequest,
    });
  }

  function handleResetPassword() {
    if (!resetTarget) return;
    if (resetPassword.length < 8) {
      toast({
        title: "Senha inválida",
        description: "A senha deve ter no mínimo 8 caracteres.",
        variant: "destructive",
      });
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      toast({
        title: "Senhas não conferem",
        description: "Digite a mesma senha nos dois campos.",
        variant: "destructive",
      });
      return;
    }
    resetPasswordMutation.mutate({
      id: resetTarget.userId,
      data: { password: resetPassword },
    });
  }

  function openResetDialog(target: User) {
    setResetPassword("");
    setResetPasswordConfirm("");
    setResetTarget({ userId: target.id, userName: target.name });
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Usuários</h1>
        <Button onClick={() => setIsCreateOpen(true)}>Criar usuário</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gestão de usuários</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Nome</th>
                  <th className="text-left py-2 px-4">E-mail</th>
                  <th className="text-left py-2 px-4">Perfil</th>
                  <th className="text-left py-2 px-4">Status</th>
                  <th className="text-left py-2 px-4">Criado em</th>
                  <th className="text-left py-2 px-4">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((entry) => (
                  <tr key={entry.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-4">{entry.name}</td>
                    <td className="py-2 px-4">{entry.email}</td>
                    <td className="py-2 px-4">
                      <Badge>{entry.role}</Badge>
                    </td>
                    <td className="py-2 px-4">
                      {entry.enabled ? (
                        <Badge variant="outline" className="bg-green-500/10">Ativo</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-500/10">Inativo</Badge>
                      )}
                    </td>
                    <td className="py-2 px-4 text-sm">{new Date(entry.createdAt).toLocaleDateString()}</td>
                    <td className="py-2 px-4 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingUser({ ...entry })}>
                        Editar
                      </Button>
                      {entry.enabled ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmAction({ type: "disable", userId: entry.id, userName: entry.name })}
                        >
                          <Lock className="w-4 h-4 mr-1" />
                          Desativar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmAction({ type: "enable", userId: entry.id, userName: entry.name })}
                        >
                          <Unlock className="w-4 h-4 mr-1" />
                          Ativar
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openResetDialog(entry)}>
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Redefinir
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmAction({ type: "delete", userId: entry.id, userName: entry.name })}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Excluir
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Senha</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
            <div>
              <Label>Perfil</Label>
              <Select value={formData.role} onValueChange={(role) => setFormData({ ...formData, role })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreateUser} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {editingUser && (
        <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Perfil</Label>
                <Select
                  value={editingUser.role}
                  onValueChange={(role) => setEditingUser({ ...editingUser, role: role as User["role"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleUpdateUser} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setResetPassword("");
            setResetPasswordConfirm("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
          </DialogHeader>
          {resetTarget ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Nova senha para <span className="font-medium text-foreground">{resetTarget.userName}</span>.
              </p>
              <div>
                <Label>Nova senha</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                />
              </div>
              <div>
                <Label>Confirmar senha</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={resetPasswordConfirm}
                  onChange={(e) => setResetPasswordConfirm(e.target.value)}
                />
              </div>
              <Button onClick={handleResetPassword} disabled={resetPasswordMutation.isPending}>
                {resetPasswordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Redefinir senha
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmAction.type !== null} onOpenChange={(open) => !open && setConfirmAction({ type: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction.type === "disable" && "Desativar usuário?"}
              {confirmAction.type === "enable" && "Ativar usuário?"}
              {confirmAction.type === "delete" && "Excluir usuário?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction.type === "disable" && `Desativar ${confirmAction.userName}? O login ficará bloqueado.`}
              {confirmAction.type === "enable" && `Ativar ${confirmAction.userName}?`}
              {confirmAction.type === "delete" && `Excluir ${confirmAction.userName}? Esta ação não pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (confirmAction.type === "disable" && confirmAction.userId) {
                disableMutation.mutate({ id: confirmAction.userId });
              } else if (confirmAction.type === "enable" && confirmAction.userId) {
                enableMutation.mutate({ id: confirmAction.userId });
              } else if (confirmAction.type === "delete" && confirmAction.userId) {
                deleteMutation.mutate({ id: confirmAction.userId });
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

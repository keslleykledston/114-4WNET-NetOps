import { useEffect, useState } from "react";
import { useAuth } from "../components/auth-provider";
import { useLocation } from "wouter";
import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser, useDisableUser, useEnableUser, useResetUserPassword, getListUsersQueryKey } from "@workspace/api-client-react";
import type { CreateUserRequest, UpdateUserRequest } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Loader2, Lock, Unlock, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";

export default function UsersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "disable" | "enable" | "delete" | "reset" | null;
    userId?: number;
    userName?: string;
  }>({ type: null });

  const [formData, setFormData] = useState({ name: "", email: "", password: "", role: "viewer" });

  // Check admin access
  useEffect(() => {
    if (user && user.role !== "admin") {
      setLocation("/devices");
    }
  }, [user, setLocation]);

  const { data: usersResponse } = useListUsers();
  const users = usersResponse?.items || [];

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setFormData({ name: "", email: "", password: "", role: "viewer" });
        setIsCreateOpen(false);
      },
    },
  });

  const updateMutation = useUpdateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setEditingUser(null);
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
        setConfirmAction({ type: null });
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

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{t("users.title")}</h1>
        <Button onClick={() => setIsCreateOpen(true)}>{t("users.createUser")}</Button>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("users.userManagement")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">{t("common.name")}</th>
                  <th className="text-left py-2 px-4">{t("users.email")}</th>
                  <th className="text-left py-2 px-4">{t("users.role")}</th>
                  <th className="text-left py-2 px-4">{t("users.status")}</th>
                  <th className="text-left py-2 px-4">{t("users.created")}</th>
                  <th className="text-left py-2 px-4">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-4">{u.name}</td>
                    <td className="py-2 px-4">{u.email}</td>
                    <td className="py-2 px-4">
                      <Badge>{u.role}</Badge>
                    </td>
                    <td className="py-2 px-4">
                      {u.enabled ? (
                        <Badge variant="outline" className="bg-green-500/10">{t("common.enabled")}</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-500/10">{t("common.disabled")}</Badge>
                      )}
                    </td>
                    <td className="py-2 px-4 text-sm">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="py-2 px-4 space-x-2 flex">
                      <Button size="sm" variant="outline" onClick={() => setEditingUser(u)}>{t("common.edit")}</Button>
                      {u.enabled ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmAction({ type: "disable", userId: u.id, userName: u.name })}
                        >
                          <Lock className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmAction({ type: "enable", userId: u.id, userName: u.name })}
                        >
                          <Unlock className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmAction({ type: "reset", userId: u.id, userName: u.name })}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmAction({ type: "delete", userId: u.id, userName: u.name })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("users.createUser")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("common.name")}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("users.email")}</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("users.password")}</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("users.role")}</Label>
              <Select value={formData.role} onValueChange={(role) => setFormData({ ...formData, role })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">{t("users.viewer")}</SelectItem>
                  <SelectItem value="operator">{t("users.operator")}</SelectItem>
                  <SelectItem value="admin">{t("users.admin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => createMutation.mutate({ data: formData as CreateUserRequest })}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("common.create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {editingUser && (
        <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("users.editUser")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("common.name")}</Label>
                <Input
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                />
              </div>
              <div>
                <Label>{t("users.role")}</Label>
                <Select value={editingUser.role} onValueChange={(role) => setEditingUser({ ...editingUser, role })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">{t("users.viewer")}</SelectItem>
                    <SelectItem value="operator">{t("users.operator")}</SelectItem>
                    <SelectItem value="admin">{t("users.admin")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => updateMutation.mutate({ id: editingUser.id, data: { name: editingUser.name, role: editingUser.role } as UpdateUserRequest })}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t("common.update")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmAction.type !== null} onOpenChange={(open) => !open && setConfirmAction({ type: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction.type === "disable" && t("users.disableUserConfirm")}
              {confirmAction.type === "enable" && t("users.enableUserConfirm")}
              {confirmAction.type === "reset" && t("users.resetPasswordConfirm")}
              {confirmAction.type === "delete" && t("users.deleteUserConfirm")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction.type === "disable" && t("users.disableUserDescription", { name: confirmAction.userName ?? "" })}
              {confirmAction.type === "enable" && t("users.enableUserDescription", { name: confirmAction.userName ?? "" })}
              {confirmAction.type === "reset" && t("users.resetPasswordDescription", { name: confirmAction.userName ?? "" })}
              {confirmAction.type === "delete" && t("users.deleteUserDescription", { name: confirmAction.userName ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (confirmAction.type === "disable" && confirmAction.userId) {
                disableMutation.mutate({ id: confirmAction.userId });
              } else if (confirmAction.type === "enable" && confirmAction.userId) {
                enableMutation.mutate({ id: confirmAction.userId });
              } else if (confirmAction.type === "reset" && confirmAction.userId) {
                const newPassword = prompt(t("users.newPasswordPrompt"));
                if (newPassword && newPassword.length >= 8) {
                  resetPasswordMutation.mutate({ id: confirmAction.userId, data: { password: newPassword } });
                }
              } else if (confirmAction.type === "delete" && confirmAction.userId) {
                deleteMutation.mutate({ id: confirmAction.userId });
              }
            }}
          >
            {t("common.confirm")}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { BellRing, RefreshCw, Save } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTenants } from "@/features/connectors/connectors-api";
import {
  getTenantNotifications,
  listAlertNotifications,
  updateTenantNotifications,
  type AlertNotification,
  type TenantNotificationSettings,
} from "@/features/notifications/notifications-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "SENT") return "default";
  if (status === "RATE_LIMITED" || status === "SKIPPED") return "secondary";
  if (status === "FAILED") return "destructive";
  return "outline";
}

function emptyForm() {
  return {
    telegram_bot_token: "",
    telegram_chat_id: "",
    webhook_url: "",
    email_enabled: false,
    email_recipients: "",
  };
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tenantId, setTenantId] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [selectedSettings, setSelectedSettings] = useState<TenantNotificationSettings | null>(null);

  const tenantsQuery = useQuery({ queryKey: ["tenant-notifications", "tenants"], queryFn: listTenants });
  const historyQuery = useQuery({
    queryKey: ["tenant-notifications", "history", tenantId],
    queryFn: () => listAlertNotifications(tenantId ? Number(tenantId) : undefined),
    enabled: Boolean(tenantId),
    refetchInterval: 30_000,
  });

  const settingsQuery = useQuery({
    queryKey: ["tenant-notifications", "settings", tenantId],
    queryFn: () => getTenantNotifications(Number(tenantId)),
    enabled: Boolean(tenantId),
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    setSelectedSettings(settingsQuery.data);
    setForm({
      telegram_bot_token: "",
      telegram_chat_id: settingsQuery.data.telegram_chat_id ?? "",
      webhook_url: settingsQuery.data.webhook_url ?? "",
      email_enabled: settingsQuery.data.email_enabled,
      email_recipients: settingsQuery.data.email_recipients ?? "",
    });
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateTenantNotifications(Number(tenantId), {
        telegram_bot_token: form.telegram_bot_token.trim() || undefined,
        telegram_chat_id: form.telegram_chat_id.trim() || null,
        webhook_url: form.webhook_url.trim() || null,
        email_enabled: form.email_enabled,
        email_recipients: form.email_recipients.trim() || null,
      }),
    onSuccess: async (data) => {
      setSelectedSettings(data);
      setForm((state) => ({ ...state, telegram_bot_token: "" }));
      await queryClient.invalidateQueries({ queryKey: ["tenant-notifications", "settings", tenantId] });
      await queryClient.invalidateQueries({ queryKey: ["tenant-notifications", "history", tenantId] });
      toast({ title: t("notifications.saved") });
    },
    onError: (error: Error) => toast({ title: t("common.error"), description: error.message, variant: "destructive" }),
  });

  const history = historyQuery.data ?? [];
  const selectedTenantName = useMemo(
    () => tenantsQuery.data?.find((tenant) => String(tenant.id) === tenantId)?.name ?? null,
    [tenantId, tenantsQuery.data],
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BellRing className="h-6 w-6 text-primary" />
            {t("notifications.tenantTitle")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("notifications.tenantSubtitle")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void historyQuery.refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t("common.refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("notifications.selectTenant")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
          >
            <option value="">{t("notifications.tenantPlaceholder")}</option>
            {(tenantsQuery.data ?? []).map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
          <div className="text-sm text-muted-foreground self-center">
            {selectedTenantName ? t("notifications.tenantConfigFor", { name: selectedTenantName }) : t("notifications.tenantConfigHint")}
          </div>
        </CardContent>
      </Card>

      {tenantId ? (
        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("notifications.configuration")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="password"
                placeholder={selectedSettings?.telegram_bot_token_configured ? t("notifications.tokenConfiguredPlaceholder") : t("notifications.telegramBotToken")}
                value={form.telegram_bot_token}
                onChange={(e) => setForm({ ...form, telegram_bot_token: e.target.value })}
              />
              <Input
                placeholder={t("notifications.telegramChatId")}
                value={form.telegram_chat_id}
                onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })}
              />
              <Input
                placeholder={t("notifications.webhookUrl")}
                value={form.webhook_url}
                onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
              />
              <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                <input
                  type="checkbox"
                  checked={form.email_enabled}
                  onChange={(e) => setForm({ ...form, email_enabled: e.target.checked })}
                />
                <div>
                  <div className="text-sm font-medium">{t("notifications.emailStructure")}</div>
                  <div className="text-xs text-muted-foreground">{t("notifications.emailStructureHint")}</div>
                </div>
              </div>
              <Input
                placeholder={t("notifications.emailRecipients")}
                value={form.email_recipients}
                onChange={(e) => setForm({ ...form, email_recipients: e.target.value })}
              />
              <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                <Save className="h-4 w-4 mr-2" />
                {t("common.save")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("notifications.alertHistory")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("notifications.channel")}</TableHead>
                    <TableHead>{t("notifications.alert")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead>{t("notifications.destination")}</TableHead>
                    <TableHead>{t("notifications.message")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((row: AlertNotification) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>{row.channel}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{row.alert_type}</div>
                          <div className="text-xs text-muted-foreground">{row.title}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono max-w-56 truncate">{row.destination ?? "—"}</TableCell>
                      <TableCell className="text-xs max-w-80 truncate">{row.message}</TableCell>
                    </TableRow>
                  ))}
                  {!historyQuery.isLoading && history.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        {t("notifications.noNotificationsRecorded")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

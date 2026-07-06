import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Device } from "@workspace/api-client-react";
import { listConnectorGroups, listTenants } from "@/features/connectors/connectors-api";
import {
  appendSnmpToDevicePayload,
  buildDeviceAccessPayload,
  getTenantIdForConnectorGroup,
  groupsForTenant,
  pickConnectorGroupForTenant,
} from "@/features/devices/device-connector-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { platformOptionsForVendor, VENDOR_OPTIONS } from "@/lib/vendor-options";
import { useTranslation } from "@/i18n";

export interface DeviceFormValues {
  hostname: string;
  ipAddress: string;
  vendor: string;
  platform: string;
  username: string;
  password: string;
  site: string;
  role: string;
  snmpCommunity: string;
  sshPort: number;
  tenantId: string;
  connectorGroupId: string;
}

interface DeviceFormDialogProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: DeviceFormValues) => void;
  isPending: boolean;
  device?: (Device & {
    connectorId?: number | null;
    connectorGroupId?: number | null;
    tenantId?: number | null;
    snmpConfigured?: boolean;
  }) | null;
  trigger?: ReactNode;
}

const DEFAULT_VALUES: DeviceFormValues = {
  hostname: "",
  ipAddress: "",
  vendor: "cisco",
  platform: "ios",
  username: "",
  password: "",
  site: "",
  role: "",
  snmpCommunity: "",
  sshPort: 22,
  tenantId: "",
  connectorGroupId: "",
};

export function DeviceFormDialog({
  mode,
  open,
  onOpenChange,
  onSubmit,
  isPending,
  device,
  trigger,
}: DeviceFormDialogProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<DeviceFormValues>(DEFAULT_VALUES);
  const groupsQuery = useQuery({ queryKey: ["connector-groups"], queryFn: listConnectorGroups });
  const tenantsQuery = useQuery({ queryKey: ["connectors", "tenants"], queryFn: listTenants });

  const groups = groupsQuery.data ?? [];
  const tenants = tenantsQuery.data ?? [];

  const tenantGroups = useMemo(() => {
    if (!form.tenantId) return [];
    return groupsForTenant(Number(form.tenantId), groups);
  }, [groups, form.tenantId]);

  const selectedGroup = useMemo(
    () => groups.find((group) => String(group.id) === form.connectorGroupId) ?? null,
    [groups, form.connectorGroupId],
  );
  const platformOptions = useMemo(
    () => platformOptionsForVendor(form.vendor),
    [form.vendor],
  );

  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && device) {
      const extended = device;
      const tenantId =
        extended.tenantId ??
        getTenantIdForConnectorGroup(extended.connectorGroupId, groups) ??
        null;
      setForm({
        hostname: device.hostname,
        ipAddress: device.ipAddress,
        vendor: device.vendor,
        platform: device.platform,
        username: device.username,
        password: "",
        site: device.site,
        role: device.role ?? "",
        snmpCommunity: "",
        sshPort: device.sshPort,
        tenantId: tenantId ? String(tenantId) : "",
        connectorGroupId: extended.connectorGroupId ? String(extended.connectorGroupId) : "",
      });
      return;
    }

    setForm(DEFAULT_VALUES);
  }, [device, mode, open, groups]);

  useEffect(() => {
    if (platformOptions.length === 0) return;
    if (platformOptions.some((option) => option.value === form.platform)) return;
    setForm((prev) => ({ ...prev, platform: platformOptions[0].value }));
  }, [platformOptions, form.platform]);

  const applyTenantSelection = (tenantId: string) => {
    if (!tenantId) {
      setForm((prev) => ({ ...prev, tenantId: "", connectorGroupId: "" }));
      return;
    }
    const picked = pickConnectorGroupForTenant(Number(tenantId), groups);
    setForm((prev) => ({
      ...prev,
      tenantId,
      connectorGroupId: picked ? String(picked.id) : "",
    }));
  };

  const title =
    mode === "create"
      ? t("deviceForm.createTitle")
      : t("deviceForm.editTitle", { hostname: device?.hostname ?? t("deviceForm.editFallback") });
  const description = mode === "create" ? t("deviceForm.createDescription") : t("deviceForm.editDescription");
  const submitLabel = mode === "create" ? t("deviceForm.submitCreate") : t("deviceForm.submitEdit");

  const tenantMissingGroup = Boolean(form.tenantId && !form.connectorGroupId);
  const snmpConfigured = mode === "edit" && Boolean(device?.snmpConfigured);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-2xl bg-slate-900 border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">{title}</DialogTitle>
          <DialogDescription className="text-slate-400">{description}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(form);
          }}
          className="space-y-4"
        >
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6 bg-slate-950/40 p-1 border border-white/5 rounded-xl">
              <TabsTrigger value="general" className="rounded-lg py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 data-[state=active]:bg-white/5 data-[state=active]:text-white transition-all">
                {t("deviceForm.tabs.general")}
              </TabsTrigger>
              <TabsTrigger value="access" className="rounded-lg py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 data-[state=active]:bg-white/5 data-[state=active]:text-white transition-all">
                {t("deviceForm.tabs.access")}
              </TabsTrigger>
              <TabsTrigger value="advanced" className="rounded-lg py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 data-[state=active]:bg-white/5 data-[state=active]:text-white transition-all">
                {t("deviceForm.tabs.advanced")}
              </TabsTrigger>
            </TabsList>

            {/* ABA 1: IDENTIFICACAO */}
            <TabsContent value="general" className="space-y-4 focus-visible:ring-0 focus-visible:outline-none">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField label={t("deviceForm.hostname")}>
                  <Input
                    required
                    value={form.hostname}
                    onChange={(event) => setForm({ ...form, hostname: event.target.value })}
                    placeholder="pe01.nyc"
                    className="bg-slate-950/40 border-white/10 text-white focus:border-cyan-400/50"
                  />
                </FormField>

                <FormField label={t("deviceForm.vendor")}>
                  <Select value={form.vendor} onValueChange={(value) => setForm({ ...form, vendor: value })}>
                    <SelectTrigger className="bg-slate-950/40 border-white/10 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                      {VENDOR_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="focus:bg-slate-800 focus:text-white">{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField label={t("deviceForm.platform")}>
                  <Select value={form.platform} onValueChange={(value) => setForm({ ...form, platform: value })}>
                    <SelectTrigger className="bg-slate-950/40 border-white/10 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                      {platformOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="focus:bg-slate-800 focus:text-white">{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField label={t("deviceForm.site")}>
                  <Input
                    required
                    value={form.site}
                    onChange={(event) => setForm({ ...form, site: event.target.value })}
                    placeholder="BVA-POP"
                    className="bg-slate-950/40 border-white/10 text-white focus:border-cyan-400/50"
                  />
                </FormField>

                <FormField label={t("deviceForm.role")}>
                  <Input
                    value={form.role}
                    onChange={(event) => setForm({ ...form, role: event.target.value })}
                    placeholder="pe, p, ce, sw"
                    className="bg-slate-950/40 border-white/10 text-white focus:border-cyan-400/50"
                  />
                </FormField>
              </div>
            </TabsContent>

            {/* ABA 2: CONEXAO */}
            <TabsContent value="access" className="space-y-4 focus-visible:ring-0 focus-visible:outline-none">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField label={t("deviceForm.ipAddress")}>
                  <Input
                    required
                    className="font-mono bg-slate-950/40 border-white/10 text-white focus:border-cyan-400/50"
                    value={form.ipAddress}
                    onChange={(event) => setForm({ ...form, ipAddress: event.target.value })}
                    placeholder="10.0.0.1"
                  />
                </FormField>

                <FormField label={t("deviceForm.sshPort")}>
                  <Input
                    required
                    type="number"
                    value={form.sshPort}
                    onChange={(event) => setForm({ ...form, sshPort: Number(event.target.value) || 22 })}
                    className="bg-slate-950/40 border-white/10 text-white focus:border-cyan-400/50"
                  />
                </FormField>

                <FormField label={t("deviceForm.username")}>
                  <Input
                    required
                    value={form.username}
                    onChange={(event) => setForm({ ...form, username: event.target.value })}
                    className="bg-slate-950/40 border-white/10 text-white focus:border-cyan-400/50"
                  />
                </FormField>

                <FormField label={t("deviceForm.password")}>
                  <Input
                    required={mode === "create"}
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    placeholder={mode === "edit" ? t("deviceForm.passwordKeepBlank") : ""}
                    className="bg-slate-950/40 border-white/10 text-white focus:border-cyan-400/50"
                  />
                </FormField>
              </div>
            </TabsContent>

            {/* ABA 3: AVANCADO */}
            <TabsContent value="advanced" className="space-y-4 focus-visible:ring-0 focus-visible:outline-none">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField label={t("deviceForm.snmpCommunity")}>
                  {snmpConfigured && !form.snmpCommunity ? (
                    <p className="text-[11px] text-slate-400 mb-1">{t("deviceForm.snmpConfiguredHint")}</p>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Input
                      className="flex-1 bg-slate-950/40 border-white/10 text-white focus:border-cyan-400/50"
                      value={form.snmpCommunity}
                      onChange={(event) => setForm({ ...form, snmpCommunity: event.target.value })}
                      placeholder={
                        mode === "edit"
                          ? (snmpConfigured ? t("deviceForm.snmpConfiguredPlaceholder") : t("deviceForm.snmpNotConfigured"))
                          : "public"
                      }
                    />
                    {snmpConfigured && !form.snmpCommunity ? (
                      <Badge variant="outline" className="shrink-0 text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                        {t("deviceForm.snmpActive")}
                      </Badge>
                    ) : null}
                  </div>
                </FormField>

                <FormField label={t("deviceForm.tenant")}>
                  <Select
                    value={form.tenantId || "none"}
                    onValueChange={(value) => applyTenantSelection(value === "none" ? "" : value)}
                  >
                    <SelectTrigger className="bg-slate-950/40 border-white/10 text-white"><SelectValue placeholder={t("deviceForm.noTenantDirect")} /></SelectTrigger>
                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                      <SelectItem value="none" className="focus:bg-slate-800 focus:text-white">{t("deviceForm.noTenantDirect")}</SelectItem>
                      {tenants.map((tenant) => (
                        <SelectItem key={tenant.id} value={String(tenant.id)} className="focus:bg-slate-800 focus:text-white">
                          {tenant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField label={t("deviceForm.connectorGroup")}>
                  <Select
                    disabled={!form.tenantId || tenantGroups.length === 0}
                    value={form.connectorGroupId || "none"}
                    onValueChange={(value) =>
                      setForm({ ...form, connectorGroupId: value === "none" ? "" : value })
                    }
                  >
                    <SelectTrigger className="bg-slate-950/40 border-white/10 text-white"><SelectValue placeholder={t("deviceForm.selectGroup")} /></SelectTrigger>
                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                      <SelectItem value="none" className="focus:bg-slate-800 focus:text-white">
                        {form.tenantId ? (tenantGroups.length > 0 ? t("deviceForm.chooseGroup") : t("deviceForm.noActiveGroup")) : t("deviceForm.selectTenantFirst")}
                      </SelectItem>
                      {tenantGroups.map((group) => (
                        <SelectItem key={group.id} value={String(group.id)} className="focus:bg-slate-800 focus:text-white">
                          {group.name} · {group.strategy} · {group.active_member_count}/{group.member_count}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedGroup ? (
                    <div className="text-[11px] text-slate-400 mt-1">
                      {t("deviceForm.tenantStrategy", { tenant: selectedGroup.tenant_name, strategy: selectedGroup.strategy })}
                    </div>
                  ) : null}
                </FormField>
              </div>

              <div className="mt-6 pt-4 border-t border-white/5">
                {form.tenantId && selectedGroup ? (
                  <p className="text-xs text-slate-400">
                    {t("deviceForm.bastionAccess", { name: selectedGroup.name, strategy: selectedGroup.strategy })}
                  </p>
                ) : form.tenantId && tenantMissingGroup ? (
                  <p className="text-xs text-rose-400 font-semibold">{t("deviceForm.tenantNoGroup")}</p>
                ) : (
                  <p className="text-xs text-slate-400">{t("deviceForm.directAccessHint")}</p>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-4 border-t border-white/5">
            <Button type="submit" disabled={isPending || tenantMissingGroup} className="bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold px-6">
              {isPending ? t("deviceForm.saving") : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

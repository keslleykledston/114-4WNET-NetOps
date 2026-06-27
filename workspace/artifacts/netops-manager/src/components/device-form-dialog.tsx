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
import { platformOptionsForVendor, VENDOR_OPTIONS } from "@/lib/vendor-options";

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

  const title = mode === "create" ? "Cadastrar Novo Dispositivo" : `Editar ${device?.hostname ?? "Dispositivo"}`;
  const description = mode === "create"
    ? "Preencha credenciais SSH e, opcionalmente, a comunidade SNMP."
    : "Atualize dados de acesso. Senha e comunidade SNMP em branco mantêm os valores atuais.";
  const submitLabel = mode === "create" ? "Adicionar Dispositivo" : "Salvar Alterações";

  const tenantMissingGroup = Boolean(form.tenantId && !form.connectorGroupId);
  const snmpConfigured = mode === "edit" && Boolean(device?.snmpConfigured);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(form);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Hostname">
              <Input
                required
                value={form.hostname}
                onChange={(event) => setForm({ ...form, hostname: event.target.value })}
                placeholder="pe01.nyc"
              />
            </FormField>

            <FormField label="IP Address">
              <Input
                required
                className="font-mono"
                value={form.ipAddress}
                onChange={(event) => setForm({ ...form, ipAddress: event.target.value })}
                placeholder="10.0.0.1"
              />
            </FormField>

            <FormField label="Vendor">
              <Select value={form.vendor} onValueChange={(value) => setForm({ ...form, vendor: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VENDOR_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Platform">
              <Select value={form.platform} onValueChange={(value) => setForm({ ...form, platform: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {platformOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Site">
              <Input
                required
                value={form.site}
                onChange={(event) => setForm({ ...form, site: event.target.value })}
                placeholder="BVA-POP"
              />
            </FormField>

            <FormField label="Role">
              <Input
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value })}
                placeholder="pe, p, ce, sw"
              />
            </FormField>

            <FormField label="SSH Port">
              <Input
                required
                type="number"
                value={form.sshPort}
                onChange={(event) => setForm({ ...form, sshPort: Number(event.target.value) || 22 })}
              />
            </FormField>

            <FormField label="Username">
              <Input
                required
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
              />
            </FormField>

            <FormField label="Password">
              <Input
                required={mode === "create"}
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder={mode === "edit" ? "Deixe em branco para manter" : ""}
              />
            </FormField>

            <FormField label="Comunidade SNMP">
              {snmpConfigured && !form.snmpCommunity ? (
                <p className="text-xs text-muted-foreground">
                  Comunidade configurada no dispositivo. Deixe em branco para manter ou digite um novo valor para substituir.
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={form.snmpCommunity}
                  onChange={(event) => setForm({ ...form, snmpCommunity: event.target.value })}
                  placeholder={
                    mode === "edit"
                      ? (snmpConfigured ? "•••••••• (configurada)" : "Não configurada")
                      : "public"
                  }
                />
                {snmpConfigured && !form.snmpCommunity ? (
                  <Badge variant="outline" className="shrink-0 text-green-600 border-green-600/40">
                    Ativa
                  </Badge>
                ) : null}
              </div>
            </FormField>

            <FormField label="Tenant">
              <Select
                value={form.tenantId || "none"}
                onValueChange={(value) => applyTenantSelection(value === "none" ? "" : value)}
              >
                <SelectTrigger><SelectValue placeholder="Sem tenant — acesso direto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem tenant — acesso direto</SelectItem>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={String(tenant.id)}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Connector Group">
              <Select
                disabled={!form.tenantId || tenantGroups.length === 0}
                value={form.connectorGroupId || "none"}
                onValueChange={(value) =>
                  setForm({ ...form, connectorGroupId: value === "none" ? "" : value })
                }
              >
                <SelectTrigger><SelectValue placeholder="Selecionar grupo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {form.tenantId ? (tenantGroups.length > 0 ? "Escolha um grupo" : "Nenhum grupo ativo") : "Selecione um tenant"}
                  </SelectItem>
                  {tenantGroups.map((group) => (
                    <SelectItem key={group.id} value={String(group.id)}>
                      {group.name} · {group.strategy} · {group.active_member_count}/{group.member_count}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedGroup ? (
                <div className="text-xs text-muted-foreground">
                  Tenant: {selectedGroup.tenant_name} · Estratégia: {selectedGroup.strategy}
                </div>
              ) : null}
            </FormField>
          </div>

          {form.tenantId && selectedGroup ? (
            <p className="text-sm text-muted-foreground">
              Acesso via bastião: <span className="font-medium text-foreground">{selectedGroup.name}</span>
              {" "}
              <span className="text-xs">({selectedGroup.strategy})</span>
              — coletas SSH/SNMP enfileiradas no grupo.
            </p>
          ) : form.tenantId && tenantMissingGroup ? (
            <p className="text-sm text-destructive">
              Este tenant não tem grupo disponível. Crie um em Infraestrutura → Connector Groups ou escolha acesso direto.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem tenant, o dispositivo usa acesso direto do servidor NetOps. Com tenant, o grupo é escolhido automaticamente.
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isPending || tenantMissingGroup}>
              {isPending ? "Salvando..." : submitLabel}
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

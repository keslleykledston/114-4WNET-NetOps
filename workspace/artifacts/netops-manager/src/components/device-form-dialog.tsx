import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Device } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
}

interface DeviceFormDialogProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: DeviceFormValues) => void;
  isPending: boolean;
  device?: Device | null;
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

  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && device) {
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
      });
      return;
    }

    setForm(DEFAULT_VALUES);
  }, [device, mode, open]);

  const title = mode === "create" ? "Cadastrar Novo Dispositivo" : `Editar ${device?.hostname ?? "Dispositivo"}`;
  const description = mode === "create"
    ? "Preencha credenciais SSH e, opcionalmente, a comunidade SNMP."
    : "Atualize dados de acesso. Senha e comunidade SNMP em branco mantêm os valores atuais.";
  const submitLabel = mode === "create" ? "Adicionar Dispositivo" : "Salvar Alterações";

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
                  <SelectItem value="cisco">Cisco</SelectItem>
                  <SelectItem value="juniper">Juniper</SelectItem>
                  <SelectItem value="huawei">Huawei</SelectItem>
                  <SelectItem value="nokia">Nokia</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Platform">
              <Select value={form.platform} onValueChange={(value) => setForm({ ...form, platform: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ios">IOS</SelectItem>
                  <SelectItem value="ios-xe">IOS-XE</SelectItem>
                  <SelectItem value="ios-xr">IOS-XR</SelectItem>
                  <SelectItem value="junos">Junos</SelectItem>
                  <SelectItem value="vrp">VRP</SelectItem>
                  <SelectItem value="sros">SR-OS</SelectItem>
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
              <Input
                value={form.snmpCommunity}
                onChange={(event) => setForm({ ...form, snmpCommunity: event.target.value })}
                placeholder={mode === "edit" ? "Deixe em branco para manter" : "public"}
              />
            </FormField>
          </div>

          <p className="text-sm text-muted-foreground">
            SNMP será usado para coletar interfaces e peerings BGP periodicamente a cada 5 minutos.
          </p>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
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

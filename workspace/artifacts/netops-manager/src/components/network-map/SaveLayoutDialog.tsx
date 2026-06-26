import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SaveLayoutDialog({
  open,
  onOpenChange,
  initialName,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  onSave: (name: string) => void;
  saving?: boolean;
}) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Salvar layout</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Nomeie o layout para restaurar posições, devices e links depois.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="layout-name">Nome do layout</Label>
          <Input
            id="layout-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Layout principal"
            className="border-zinc-800 bg-zinc-900"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            disabled={!name.trim() || saving}
            onClick={() => onSave(name.trim())}
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

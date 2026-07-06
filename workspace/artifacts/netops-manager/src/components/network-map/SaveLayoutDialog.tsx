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
import { useTranslation } from "@/i18n";

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
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("networkMap.saveLayout.title")}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {t("networkMap.saveLayout.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="layout-name">{t("networkMap.saveLayout.nameLabel")}</Label>
          <Input
            id="layout-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("networkMap.saveLayout.namePlaceholder")}
            className="border-zinc-800 bg-zinc-900"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!name.trim() || saving}
            onClick={() => onSave(name.trim())}
          >
            {saving ? t("networkMap.saveLayout.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

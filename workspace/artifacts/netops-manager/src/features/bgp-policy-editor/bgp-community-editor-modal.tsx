import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";
import type {
  BgpPolicyEditorCommunityEditPayload,
  BgpPolicyEditorCommunityOption,
  BgpPolicyEditorCommunitySetOption,
} from "./bgp-policy-editor.types";
import {
  findMatchingCommunitySet,
  normalizeToken,
  resolveCommunitySelection,
} from "./bgp-policy-editor.utils";

interface BgpCommunityEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceName: string;
  peerIp: string;
  policyName: string;
  afiSafi: string;
  sequence: number | null;
  nodeLabel: string;
  nodeKey: string;
  initialSelectedCommunities: string[];
  initialMatchedCommunityListName: string | null;
  communityOptions: BgpPolicyEditorCommunityOption[];
  communitySets: BgpPolicyEditorCommunitySetOption[];
  onSave: (payload: BgpPolicyEditorCommunityEditPayload) => void;
}

export function BgpCommunityEditorModal({
  open,
  onOpenChange,
  deviceName,
  peerIp,
  policyName,
  afiSafi,
  sequence,
  nodeLabel,
  nodeKey,
  initialSelectedCommunities,
  initialMatchedCommunityListName,
  communityOptions,
  communitySets,
  onSave,
}: BgpCommunityEditorModalProps) {
  const { t } = useTranslation();
  const ce = "bgpPolicyEditor.communityEditor";
  const normalizedInitial = useMemo(
    () => [...new Set(initialSelectedCommunities.map(normalizeToken))].filter(Boolean),
    [initialSelectedCommunities],
  );
  const [selectedCommunities, setSelectedCommunities] = useState<string[]>(normalizedInitial);
  const [selectedListName, setSelectedListName] = useState<string | null>(initialMatchedCommunityListName);

  const resolution = useMemo(
    () => resolveCommunitySelection(selectedCommunities, communitySets),
    [communitySets, selectedCommunities],
  );
  const matchedSet = useMemo(
    () => findMatchingCommunitySet(selectedCommunities, communitySets),
    [communitySets, selectedCommunities],
  );
  const isCustom = resolution.isCustom;
  const customLabel = t(`${ce}.custom`);

  useEffect(() => {
    if (!open) return;
    setSelectedCommunities(normalizedInitial);
    setSelectedListName(initialMatchedCommunityListName);
  }, [initialMatchedCommunityListName, normalizedInitial, open]);

  useEffect(() => {
    if (!matchedSet) return;
    setSelectedListName(matchedSet.name);
  }, [matchedSet]);

  function toggleCommunity(value: string) {
    setSelectedCommunities((current) => {
      const normalized = normalizeToken(value);
      const next = current.includes(normalized)
        ? current.filter((item) => item !== normalized)
        : [...current, normalized];
      return [...new Set(next)].sort((left, right) => left.localeCompare(right, "pt", { sensitivity: "base" }));
    });
  }

  function handleSelectList(value: string) {
    if (value === "__custom__") {
      setSelectedListName(null);
      return;
    }
    const set = communitySets.find((item) => item.name === value || item.vrpObjectName === value);
    if (!set) return;
    setSelectedListName(set.name);
    setSelectedCommunities([...new Set(set.members.map(normalizeToken))].filter(Boolean).sort());
  }

  function handleSave() {
    const nextMatched = matchedSet ?? (selectedListName
      ? communitySets.find((item) => item.name === selectedListName || item.vrpObjectName === selectedListName) ?? null
      : null);
    const nextIsCustom = resolution.isCustom;
    const nextName = nextMatched?.name ?? (selectedListName ?? null);
    onSave({
      key: nodeKey,
      policyName,
      afiSafi: "ipv4_unicast",
      sequence: null,
      selectedCommunities: [...resolution.normalizedCommunities],
      matchedCommunityListName: nextName,
      isCustom: nextIsCustom,
      normalizedCommunities: [...resolution.normalizedCommunities],
      confidence: resolution.confidence,
      changed: true,
      previewText: [
        `${t(`${ce}.previewNode`)}: ${nodeLabel}`,
        `${t(`${ce}.previewAfiSafi`)}: ${afiSafi}`,
        `${t(`${ce}.previewSequence`)}: ${sequence ?? "—"}`,
        `${t(`${ce}.previewDevice`)}: ${deviceName}`,
        `${t(`${ce}.previewPeer`)}: ${peerIp}`,
        `${t(`${ce}.previewSelected`)}: ${resolution.normalizedCommunities.length ? resolution.normalizedCommunities.join(" ") : "—"}`,
        `${t(`${ce}.previewCommunityList`)}: ${nextName ?? customLabel}`,
        `${t(`${ce}.previewConfidence`)}: ${resolution.confidence}`,
      ].join("\n"),
    });
    onOpenChange(false);
  }

  const currentListName = resolution.matchedCommunityListName ?? matchedSet?.name ?? selectedListName ?? initialMatchedCommunityListName ?? customLabel;
  const customState = isCustom || !matchedSet;
  const setOptions = communitySets;
  const currentSelectValue = resolution.matchedCommunityListName && setOptions.some((item) => item.name === resolution.matchedCommunityListName)
    ? resolution.matchedCommunityListName
    : selectedListName && setOptions.some((item) => item.name === selectedListName || item.vrpObjectName === selectedListName)
      ? selectedListName
      : "__custom__";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t(`${ce}.title`)}</DialogTitle>
          <DialogDescription>
            {deviceName} · {peerIp} · {policyName} · {nodeLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertTitle>{t(`${ce}.localStateTitle`)}</AlertTitle>
            <AlertDescription>{t(`${ce}.localStateDesc`)}</AlertDescription>
          </Alert>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t(`${ce}.currentCommunityList`)}</Label>
              <Select value={currentSelectValue} onValueChange={handleSelectList}>
                <SelectTrigger>
                  <SelectValue placeholder={customLabel} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__custom__">{customLabel}</SelectItem>
                  {setOptions.length > 0 ? (
                    setOptions.map((set) => (
                      <SelectItem key={set.id} value={set.name}>
                        {set.name} · {set.vrpObjectName}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__empty__" disabled>
                      {t(`${ce}.noCommunityListsLoaded`)}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t(`${ce}.state`)}</Label>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{customState ? customLabel : t(`${ce}.recognized`)}</Badge>
                <Badge variant="outline">{t(`${ce}.communitiesCount`, { count: selectedCommunities.length })}</Badge>
                <Badge variant="outline">{currentListName}</Badge>
                <Badge variant="outline">conf: {resolution.confidence}</Badge>
              </div>
            </div>
          </div>

          {communityOptions.length > 0 ? (
            <div className="rounded-md border border-border">
              <div className="border-b border-border px-3 py-2 text-sm font-medium">
                {t(`${ce}.communityMatrix`)}
              </div>
              <ScrollArea className="max-h-80">
                <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
                  {communityOptions.map((option) => {
                    const checked = selectedCommunities.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className={cn(
                          "flex items-start gap-3 rounded-md border px-3 py-2 text-sm transition-colors",
                          checked ? "border-primary/60 bg-primary/5" : "border-border bg-muted/10",
                        )}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => toggleCommunity(option.value)} />
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-xs break-all">{option.value}</div>
                          <div className="text-[11px] text-muted-foreground break-all">{option.label}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <Alert>
              <AlertTitle>{t(`${ce}.noCommunitiesTitle`)}</AlertTitle>
              <AlertDescription>{t(`${ce}.noCommunitiesDesc`)}</AlertDescription>
            </Alert>
          )}

          <div className="rounded-md border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{t(`${ce}.localPreview`)}</div>
                <div className="text-xs text-muted-foreground">{t(`${ce}.localPreviewDesc`)}</div>
              </div>
              <Badge variant="outline">{isCustom ? customLabel : t(`${ce}.communityListFound`)}</Badge>
            </div>
            <pre className="mt-3 overflow-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">
{selectedCommunities.length ? selectedCommunities.join("\n") : t(`${ce}.noCommunitySelected`)}
            </pre>
          </div>
        </div>

        <DialogFooter className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={handleSave}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

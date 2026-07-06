import { useEffect, useMemo, useState } from "react";
import type { Device } from "@workspace/api-client-react";
import {
  AlertCircle,
  ChevronRight,
  Copy,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";
import { useTranslation } from "@/i18n";
import type { TranslationParams } from "@/i18n/types";
import { CommunityApplyConfirmModal } from "@/features/communities/community-apply-confirm-modal";
import {
  useApplyCommunitySet,
  useCommunityLibraryItems,
  useCompareCommunitySets,
  useCommunityPreview,
  useCommunitySets,
  useCreateCommunitySet,
  useDeleteCommunitySet,
  useResyncCommunityLibrary,
  useUpdateCommunitySet,
  type CommunitySet,
} from "@/features/device-discovery/community-api";

interface CommunitiesPanelProps {
  device: Device;
}

type CommunityPreviewResult = {
  candidateConfigText: string;
  candidateSha256: string;
  warnings: string[];
  membersMissingLibrary: number;
  missingCommunityValues: string[];
};

function isImportedOrigin(origin: string) {
  return origin === "discovered" || origin === "discovered_running_config" || origin === "discovered_live";
}

function isAppCreatedOrigin(origin: string) {
  return !isImportedOrigin(origin);
}

type TranslateFn = (key: string, params?: TranslationParams) => string;

function formatSyncSummary(
  result: {
    source: "running_config" | "live_ssh";
    libraryInserted: number;
    libraryUpdated: number;
    setsInserted: number;
    setMembersInserted: number;
    setMembersMissingLibrary: number;
  },
  t: TranslateFn,
) {
  const sourceLabel =
    result.source === "live_ssh"
      ? t("communities.panel.syncSource.liveSsh")
      : t("communities.panel.syncSource.backup");
  const parts = [
    t("communities.toasts.syncSummary.source", { source: sourceLabel }),
    t("communities.toasts.syncSummary.newFilters", { count: result.libraryInserted }),
    t("communities.toasts.syncSummary.updatedFilters", { count: result.libraryUpdated }),
    t("communities.toasts.syncSummary.importedSets", { count: result.setsInserted }),
    t("communities.toasts.syncSummary.members", { count: result.setMembersInserted }),
  ];
  if (result.setMembersMissingLibrary > 0) {
    parts.push(t("communities.toasts.syncSummary.missingLibrary", { count: result.setMembersMissingLibrary }));
  }
  return parts.join(" · ");
}

function statusClass(status: string) {
  if (status === "applied") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  if (status === "ready") return "border-sky-500/25 bg-sky-500/10 text-sky-300";
  if (status === "draft") return "border-border bg-muted/40 text-muted-foreground";
  if (status === "failed") return "border-red-500/25 bg-red-500/10 text-red-300";
  return "border-border bg-muted/40 text-muted-foreground";
}

function statusLabel(status: string) {
  if (status === "ready") return "pending_confirmation";
  if (status === "draft") return "draft";
  if (status === "applied") return "applied";
  if (status === "failed") return "failed";
  return status;
}

function originClass(origin: string) {
  if (origin === "discovered_live") return "border-sky-500/25 bg-sky-500/10 text-sky-200";
  if (origin === "discovered" || origin === "discovered_running_config") return "border-indigo-500/25 bg-indigo-500/10 text-indigo-200";
  return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
}

function SetMemberRow({ member }: { member: CommunitySet["members"][number] }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2">
      <div className="min-w-0">
        <div className="font-mono text-xs text-foreground">{member.communityValue}</div>
        {member.valueDescription ? (
          <div className="mt-1 truncate text-[11px] text-muted-foreground" title={member.valueDescription}>
            {member.valueDescription}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {member.linkedFilterName ? (
          <Badge variant="secondary" className="bg-sky-500/10 text-sky-300">
            {member.linkedFilterName}
          </Badge>
        ) : null}
        {member.missingInLibrary ? (
          <Badge variant="secondary" className="bg-amber-500/10 text-amber-300">
            {t("communities.panel.member.missing")}
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-300">
            {t("communities.panel.member.linked")}
          </Badge>
        )}
      </div>
    </div>
  );
}

export function CommunitiesPanel({ device }: CommunitiesPanelProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManage = user?.role !== "viewer";
  const { toast } = useToast();

  const [tab, setTab] = useState<"library" | "sets">("library");
  const [librarySearch, setLibrarySearch] = useState("");
  const [debouncedLibrarySearch, setDebouncedLibrarySearch] = useState("");
  const [setSearch, setSetSearch] = useState("");
  const [debouncedSetSearch, setDebouncedSetSearch] = useState("");
  const [selectedSetId, setSelectedSetId] = useState<number | null>(null);
  const [compareSetId, setCompareSetId] = useState<number | null>(null);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [vrpObjectName, setVrpObjectName] = useState("");
  const [description, setDescription] = useState("");
  const [previewResult, setPreviewResult] = useState<CommunityPreviewResult | null>(null);
  const [pendingApply, setPendingApply] = useState(false);

  const libraryQuery = useCommunityLibraryItems(device.id, debouncedLibrarySearch);
  const setsQuery = useCommunitySets(device.id);
  const resyncMutation = useResyncCommunityLibrary();
  const createMutation = useCreateCommunitySet();
  const updateMutation = useUpdateCommunitySet();
  const deleteMutation = useDeleteCommunitySet();
  const applyMutation = useApplyCommunitySet();
  const previewQuery = useCommunityPreview(device.id, selectedSetId ?? 0, false);
  const compareQuery = useCompareCommunitySets(device.id, selectedSetId, compareSetId);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedLibrarySearch(librarySearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [librarySearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSetSearch(setSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [setSearch]);

  const allSets = setsQuery.data ?? [];
  const libraryItems = libraryQuery.data ?? [];

  useEffect(() => {
    if (selectedSetId !== null || creatingNew) return;
    const firstSetId = allSets[0]?.id ?? null;
    if (firstSetId !== null) {
      setSelectedSetId(firstSetId);
    }
  }, [allSets, creatingNew, selectedSetId]);

  const selectedSet = useMemo(() => {
    if (selectedSetId === null) return null;
    return allSets.find((set) => set.id === selectedSetId) ?? null;
  }, [allSets, selectedSetId]);

  const compareSet = useMemo(() => {
    if (compareSetId === null) return null;
    return allSets.find((set) => set.id === compareSetId) ?? null;
  }, [allSets, compareSetId]);
  const filteredSets = useMemo(() => {
    const q = debouncedSetSearch.toLowerCase();
    if (!q) return allSets;
    return allSets.filter((set) => {
      const blob = [
        set.name,
        set.slug,
        set.vrpObjectName,
        set.origin,
        set.status,
        set.description,
        ...(set.discoveredMembersJson ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [allSets, debouncedSetSearch]);

  const importedSets = filteredSets.filter((set) => isImportedOrigin(set.origin)).length;
  const activeLibrary = libraryItems.filter((item) => item.isActive).length;

  useEffect(() => {
    if (creatingNew) {
      setPreviewResult(null);
      return;
    }
    if (!selectedSet) {
      setName("");
      setSlug("");
      setVrpObjectName("");
      setDescription("");
      setPreviewResult(null);
      return;
    }

    setName(selectedSet.name ?? "");
    setSlug(selectedSet.slug ?? "");
    setVrpObjectName(selectedSet.vrpObjectName ?? "");
    setDescription(selectedSet.description ?? "");
    setPreviewResult(null);
  }, [creatingNew, selectedSet]);

  async function handleResync(source: "backup" | "live") {
    try {
      const result = await resyncMutation.mutateAsync({ deviceId: device.id, source });
      toast({
        title: source === "backup" ? t("communities.toasts.syncBackupDone") : t("communities.toasts.syncLiveDone"),
        description: formatSyncSummary(result, t),
      });
    } catch (error) {
      toast({
        title: source === "backup" ? t("communities.toasts.syncBackupFailed") : t("communities.toasts.syncLiveFailed"),
        description: error instanceof Error ? error.message : t("communities.toasts.deviceUnreachable"),
        variant: "destructive",
      });
    }
  }

  function resetEditor() {
    setCreatingNew(false);
    setSelectedSetId(null);
    setCompareSetId(null);
    setCompareDialogOpen(false);
    setApplyDialogOpen(false);
    setPendingApply(false);
    setName("");
    setSlug("");
    setVrpObjectName("");
    setDescription("");
    setPreviewResult(null);
  }

  function startCreate() {
    setCreatingNew(true);
    setSelectedSetId(null);
    setCompareSetId(null);
    setCompareDialogOpen(false);
    setApplyDialogOpen(false);
    setPendingApply(false);
    setName("");
    setSlug("");
    setVrpObjectName("");
    setDescription("");
    setPreviewResult(null);
  }

  function startCloneFromSelected() {
    if (!selectedSet) return;
    setCreatingNew(true);
    setSelectedSetId(null);
    setCompareSetId(null);
    setCompareDialogOpen(false);
    setApplyDialogOpen(false);
    setPendingApply(false);
    setName(selectedSet.name ?? "");
    setSlug(selectedSet.slug ? `${selectedSet.slug}-copy` : "");
    setVrpObjectName(selectedSet.vrpObjectName ?? "");
    setDescription(selectedSet.description ?? "");
    setPreviewResult(null);
  }

  async function saveEditor() {
    if (!canManage) return;

    const payload = {
      name: name.trim(),
      slug: slug.trim() || undefined,
      vrpObjectName: vrpObjectName.trim() || undefined,
      description: description.trim() || undefined,
    };

    if (!payload.name) {
      toast({ title: t("communities.toasts.nameRequired"), variant: "destructive" });
      return;
    }

    try {
      if (creatingNew) {
        const created = (await createMutation.mutateAsync({
          deviceId: device.id,
          ...payload,
        })) as CommunitySet;
        toast({ title: t("communities.toasts.setCreated") });
        setCreatingNew(false);
        setSelectedSetId(created.id);
        setCompareSetId(null);
        setCompareDialogOpen(false);
      } else if (selectedSet) {
        const updated = (await updateMutation.mutateAsync({
          deviceId: device.id,
          setId: selectedSet.id,
          ...payload,
        })) as CommunitySet;
        toast({ title: t("communities.toasts.setUpdated") });
        setSelectedSetId(updated.id);
      }
    } catch (error) {
      toast({
        title: t("communities.toasts.saveFailed"),
        description: error instanceof Error ? error.message : t("communities.toasts.unexpectedError"),
        variant: "destructive",
      });
    }
  }

  async function handleDelete() {
    if (!selectedSet || !canManage) return;
    if (!window.confirm(t("communities.toasts.deleteConfirm"))) return;

    try {
      await deleteMutation.mutateAsync({ deviceId: device.id, setId: selectedSet.id });
      toast({ title: t("communities.toasts.setDeleted") });
      resetEditor();
    } catch (error) {
      toast({
        title: t("communities.toasts.deleteFailed"),
        description: error instanceof Error ? error.message : t("communities.toasts.unexpectedError"),
        variant: "destructive",
      });
    }
  }

  async function handlePreview() {
    if (!selectedSet || creatingNew || isImportedOrigin(selectedSet.origin)) return false;
    try {
      const result = (await previewQuery.refetch()).data as CommunityPreviewResult | undefined;
      setPreviewResult(result ?? null);
      toast({ title: t("communities.toasts.previewGenerated") });
      return Boolean(result);
    } catch (error) {
      toast({
        title: t("communities.toasts.previewFailed"),
        description: error instanceof Error ? error.message : t("communities.toasts.previewGenerateFailed"),
        variant: "destructive",
      });
      return false;
    }
  }

  async function copyToClipboard(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: t("communities.toasts.copied", { label }) });
    } catch {
      toast({
        title: t("communities.toasts.copyFailed", { label: label.toLowerCase() }),
        description: t("communities.toasts.copyBlocked"),
        variant: "destructive",
      });
    }
  }

  async function handleApply() {
    if (!selectedSet || creatingNew || isImportedOrigin(selectedSet.origin)) return;
    if (!previewResult?.candidateSha256) {
      const result = await handlePreview();
      if (!result) return;
    }
    setApplyDialogOpen(true);
  }

  async function confirmApplySet() {
    if (!selectedSet || creatingNew || isImportedOrigin(selectedSet.origin) || !previewResult) return;

    try {
      setPendingApply(true);
      await applyMutation.mutateAsync({
        deviceId: device.id,
        setId: selectedSet.id,
        confirm: true,
        expectedCandidateSha256: previewResult.candidateSha256,
        acknowledgeMissingLibraryRefs: previewResult.missingCommunityValues.length > 0,
      });
      setApplyDialogOpen(false);
      toast({ title: t("communities.toasts.configApplied") });
    } catch (error) {
      toast({
        title: t("communities.toasts.applyFailed"),
        description: error instanceof Error ? error.message : t("communities.toasts.unexpectedError"),
        variant: "destructive",
      });
    } finally {
      setPendingApply(false);
    }
  }

  function openCompareWithSet(targetSetId: number) {
    if (selectedSet?.id === targetSetId) return;
    setCreatingNew(false);
    setSelectedSetId(targetSetId);
    setPreviewResult(null);
    setCompareDialogOpen(true);
    setCompareSetId(allSets.find((candidate) => candidate.id !== targetSetId)?.id ?? null);
  }

  const isBusy = libraryQuery.isLoading || setsQuery.isLoading || resyncMutation.isPending;

  return (
    <div className="space-y-4">
      <Card className="border-[#252840] bg-[#10131a]">
        <CardHeader className="space-y-3 border-b border-[#252840]">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-[18px] font-bold text-foreground">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#252840] bg-[#161922]">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </span>
                {t("communities.panel.title")}
              </CardTitle>
              <CardDescription className="max-w-4xl text-[12px] text-muted-foreground">
                {t("communities.panel.description")}
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleResync("backup")}
                disabled={resyncMutation.isPending}
                className="border-[#252840] text-muted-foreground hover:border-brand-blue hover:text-brand-blue"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${resyncMutation.isPending ? "animate-spin" : ""}`} />
                {t("communities.panel.syncBackup")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleResync("live")}
                disabled={resyncMutation.isPending}
                className="border-[#252840] text-muted-foreground hover:border-sky-500/50 hover:text-sky-300"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${resyncMutation.isPending ? "animate-spin" : ""}`} />
                {t("communities.panel.syncLiveSsh")}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="border-[#252840] bg-[#161922] text-[11px] text-muted-foreground">
              {t("communities.panel.badges.entries", { count: libraryItems.length })}
            </Badge>
            <Badge variant="secondary" className="border-[#252840] bg-[#161922] text-[11px] text-muted-foreground">
              {t("communities.panel.badges.active", { count: activeLibrary })}
            </Badge>
            <Badge variant="secondary" className="border-[#252840] bg-[#161922] text-[11px] text-muted-foreground">
              {t("communities.panel.badges.sets", { count: filteredSets.length })}
            </Badge>
            <Badge variant="secondary" className="border-[#252840] bg-[#161922] text-[11px] text-muted-foreground">
              {t("communities.panel.badges.imported", { count: importedSets })}
            </Badge>
            <Badge variant="secondary" className="border-[#252840] bg-[#161922] text-[11px] text-muted-foreground">
              {t("communities.panel.badges.device", { id: device.id })}
            </Badge>
          </div>

          <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={librarySearch}
              onChange={(event) => setLibrarySearch(event.target.value)}
              placeholder={t("communities.panel.searchPlaceholder")}
              className="border-[#252840] bg-[#11141c] pl-9 text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </CardHeader>
      </Card>

      {libraryQuery.isError || setsQuery.isError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t("communities.panel.loadError")}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as "library" | "sets")}>
        <TabsList className="inline-flex w-fit gap-1 rounded-lg border border-[#252840] bg-[#161922] p-1">
          <TabsTrigger
            value="library"
            className="rounded-md px-4 py-1.5 text-[12px] font-medium text-muted-foreground data-[state=active]:bg-brand-blue data-[state=active]:text-white"
          >
            {t("communities.panel.tabs.library")}
          </TabsTrigger>
          <TabsTrigger
            value="sets"
            className="rounded-md px-4 py-1.5 text-[12px] font-medium text-muted-foreground data-[state=active]:bg-brand-blue data-[state=active]:text-white"
          >
            {t("communities.panel.tabs.sets")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-4">
          <Card className="border-[#252840] bg-[#10131a]">
            <CardHeader className="space-y-2 border-b border-[#252840]">
              <CardTitle className="text-[14px] text-foreground">{t("communities.panel.library.title")}</CardTitle>
              <CardDescription className="text-[12px] text-muted-foreground">
                {t("communities.panel.library.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#161922] text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-semibold">{t("communities.panel.library.table.filter")}</th>
                      <th className="px-3 py-2 font-semibold">{t("communities.panel.library.table.value")}</th>
                      <th className="px-3 py-2 font-semibold">{t("communities.panel.library.table.description")}</th>
                      <th className="px-3 py-2 font-semibold">{t("communities.panel.library.table.type")}</th>
                      <th className="px-3 py-2 font-semibold">{t("communities.panel.library.table.action")}</th>
                      <th className="px-3 py-2 font-semibold">{t("communities.panel.library.table.origin")}</th>
                      <th className="px-3 py-2 font-semibold">{t("communities.panel.library.table.state")}</th>
                      <th className="px-3 py-2 font-semibold text-right">{t("communities.panel.library.table.usageRp")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {isBusy ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                          {t("communities.panel.library.loading")}
                        </td>
                      </tr>
                    ) : libraryItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                          {t("communities.panel.library.empty")}
                        </td>
                      </tr>
                    ) : (
                      libraryItems.map((item) => (
                        <tr key={item.id} className="hover:bg-[#1a1d2e]">
                          <td className="px-3 py-2 font-mono text-[11px] text-foreground">{item.filterName}</td>
                          <td className="px-3 py-2 font-mono text-[11px] text-primary">{item.communityValue}</td>
                          <td className="max-w-[280px] px-3 py-2 text-xs text-muted-foreground" title={item.description ?? ""}>
                            {item.description || "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{item.matchType}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{item.action}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            <Badge variant="secondary" className={originClass(item.origin)}>
                              {item.origin}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {item.isActive ? (
                              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-200">
                                {t("communities.panel.library.active")}
                              </span>
                            ) : (
                              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-200">
                                {t("communities.panel.library.inactive")}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground">{item.usageCount ?? 0}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sets" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[440px_minmax(0,1fr)]">
            <Card className="overflow-hidden border-[#252840] bg-[#10131a]">
              <CardHeader className="space-y-2.5 border-b border-[#252840]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-[14px] text-foreground">{t("communities.panel.sets.listTitle")}</CardTitle>
                    <CardDescription className="text-[12px] text-muted-foreground">{t("communities.panel.sets.listDescription")}</CardDescription>
                  </div>
                  {canManage ? (
                    <Button variant="outline" size="sm" onClick={startCreate} className="border-[#252840] text-muted-foreground hover:border-brand-blue hover:text-brand-blue">
                      <Plus className="mr-2 h-4 w-4" />
                      {t("communities.panel.sets.new")}
                    </Button>
                  ) : null}
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={setSearch}
                    onChange={(event) => setSetSearch(event.target.value)}
                    placeholder={t("communities.panel.sets.searchPlaceholder")}
                    className="border-[#252840] bg-[#11141c] pl-9 text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[840px]">
                  <div className="space-y-1 p-3">
                    {isBusy ? (
                      <div className="rounded-lg border border-dashed border-[#252840] p-8 text-center text-sm text-muted-foreground">
                        {t("communities.panel.sets.loading")}
                      </div>
                    ) : filteredSets.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-[#252840] p-8 text-center text-sm text-muted-foreground">
                        {t("communities.panel.sets.empty")}
                      </div>
                    ) : (
                      filteredSets.map((set) => {
                        const active = selectedSet?.id === set.id && !creatingNew;
                        return (
                          <button
                            key={set.id}
                            type="button"
                            onClick={() => {
                              setCreatingNew(false);
      setSelectedSetId(set.id);
      setPreviewResult(null);
      setCompareSetId(null);
                            }}
                            className={[
                              "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                              active ? "border-brand-blue/40 bg-brand-blue/5" : "border-[#252840] bg-[#11141c] hover:bg-[#1a1d2e]",
                            ].join(" ")}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-[13px] font-medium leading-5 text-foreground">{set.name}</div>
                                <div className="mt-0.5 font-mono text-[11px] leading-4 text-muted-foreground">{set.vrpObjectName}</div>
                              </div>
                              <Badge variant="secondary" className={statusClass(set.status)}>
                                {statusLabel(set.status)}
                              </Badge>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                              <span className="font-mono">{set.origin}</span>
                              <span>{t("communities.panel.sets.membersCount", { count: set.membersTotal })}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge variant="secondary" className={originClass(set.origin)}>
                                {set.origin}
                              </Badge>
                              {isImportedOrigin(set.origin) ? (
                                <Badge variant="secondary" className="bg-slate-500/10 text-slate-300">
                                  read_only
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-200">
                                  app_created
                                </Badge>
                              )}
                              <Badge variant="secondary" className="border-[#252840] bg-[#161922] text-muted-foreground">
                                {t("communities.panel.sets.missingCount", { count: set.membersMissing })}
                              </Badge>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded border border-[#252840] px-2 py-1 text-[10px] text-muted-foreground hover:border-brand-blue hover:text-brand-blue"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setCreatingNew(false);
                                  setSelectedSetId(set.id);
                                  setPreviewResult(null);
                                  setCompareSetId(null);
                                }}
                              >
                                <Eye className="h-3 w-3" />
                                {t("communities.panel.sets.detail")}
                              </button>
                              {canManage && (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded border border-[#252840] px-2 py-1 text-[10px] text-muted-foreground hover:border-brand-blue hover:text-brand-blue"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setCreatingNew(true);
                                    setSelectedSetId(null);
                                    setCompareSetId(null);
                                    setPreviewResult(null);
                                    setName(set.name ?? "");
                                    setSlug(set.slug ? `${set.slug}-copy` : "");
                                    setVrpObjectName(set.vrpObjectName ?? "");
                                    setDescription(set.description ?? "");
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                  {t("communities.panel.sets.clone")}
                                </button>
                              )}
                              {canManage && allSets.length > 1 && (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded border border-[#252840] px-2 py-1 text-[10px] text-muted-foreground hover:border-amber-500/50 hover:text-amber-200"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openCompareWithSet(set.id);
                                  }}
                                >
                                  <Eye className="h-3 w-3" />
                                  {t("communities.panel.sets.compare")}
                                </button>
                              )}
                              {canManage && isAppCreatedOrigin(set.origin) ? (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded border border-[#252840] px-2 py-1 text-[10px] text-muted-foreground hover:border-sky-500/50 hover:text-sky-200"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setCreatingNew(false);
                                    setSelectedSetId(set.id);
                                    setPreviewResult(null);
                                    setCompareSetId(null);
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                  {t("communities.panel.sets.edit")}
                                </button>
                              ) : null}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-[#252840] bg-[#10131a]">
              <CardHeader className="space-y-1.5 border-b border-[#252840]">
                <CardTitle className="text-[14px] text-foreground">{t("communities.panel.details.title")}</CardTitle>
                <CardDescription className="text-[12px] text-muted-foreground">
                  {t("communities.panel.details.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 p-4 lg:h-[840px] lg:overflow-y-auto">
                {creatingNew ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="border-[#252840] bg-[#161922] text-muted-foreground">
                        {t("communities.panel.details.newDraft")}
                      </Badge>
                      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-200">
                        {t("communities.panel.details.appCreated")}
                      </Badge>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1.5 text-sm">
                        <span className="text-muted-foreground">{t("communities.panel.details.friendlyName")}</span>
                        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("communities.panel.details.placeholders.friendlyName")} className="border-[#252840] bg-[#11141c] text-foreground placeholder:text-muted-foreground" />
                      </label>
                      <label className="space-y-1.5 text-sm">
                        <span className="text-muted-foreground">{t("communities.panel.details.slug")}</span>
                        <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder={t("communities.panel.details.placeholders.slug")} className="border-[#252840] bg-[#11141c] text-foreground placeholder:text-muted-foreground" />
                      </label>
                    </div>

                    <label className="space-y-1.5 text-sm">
                      <span className="text-muted-foreground">{t("communities.panel.details.vrpObjectName")}</span>
                      <Input
                        value={vrpObjectName}
                        onChange={(event) => setVrpObjectName(event.target.value)}
                        placeholder={t("communities.panel.details.placeholders.vrpObjectName")}
                        className="border-[#252840] bg-[#11141c] font-mono text-foreground placeholder:text-muted-foreground"
                      />
                    </label>

                    <label className="space-y-1.5 text-sm">
                      <span className="text-muted-foreground">{t("communities.panel.details.descriptionLabel")}</span>
                      <Textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder={t("communities.panel.details.placeholders.description")}
                        className="min-h-28 border-[#252840] bg-[#11141c] text-foreground placeholder:text-muted-foreground"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => void saveEditor()} disabled={createMutation.isPending || !name.trim()}>
                        <Save className="mr-2 h-4 w-4" />
                        {t("communities.panel.details.save")}
                      </Button>
                      <Button variant="outline" onClick={() => void resetEditor()} className="border-[#252840] text-muted-foreground hover:border-brand-blue hover:text-brand-blue">
                        {t("communities.panel.details.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : selectedSet ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-lg font-semibold text-foreground">{selectedSet.name}</h4>
                          <Badge variant="secondary" className={statusClass(selectedSet.status)}>
                            {statusLabel(selectedSet.status)}
                          </Badge>
                          <Badge variant="secondary" className={originClass(selectedSet.origin)}>
                            {selectedSet.origin}
                          </Badge>
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">{selectedSet.vrpObjectName}</div>
                        {selectedSet.description ? <p className="max-w-3xl text-sm text-muted-foreground">{selectedSet.description}</p> : null}
                      </div>
                      <div className="rounded-lg border border-[#252840] bg-[#11141c] px-3 py-2 text-sm text-muted-foreground">
                        <div>{t("communities.panel.sets.membersCount", { count: selectedSet.membersTotal })}</div>
                        <div>{t("communities.panel.details.resolved", { count: selectedSet.membersResolved })}</div>
                        <div>{t("communities.panel.details.missingInLibrary", { count: selectedSet.membersMissing })}</div>
                      </div>
                    </div>

                    {isImportedOrigin(selectedSet.origin) ? (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                        {t("communities.panel.details.importedReadOnly")}
                      </div>
                    ) : null}

                    {selectedSet.membersMissing > 0 ? (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-3 text-sm text-amber-200">
                        <div className="font-medium">
                          {selectedSet.membersMissing > 1
                            ? t("communities.panel.details.membersMissingRefMany", { count: selectedSet.membersMissing })
                            : t("communities.panel.details.membersMissingRefOne", { count: selectedSet.membersMissing })}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedSet.members
                            .filter((member) => member.missingInLibrary)
                            .map((member) => (
                              <Badge key={`${selectedSet.id}-${member.position}-${member.communityValue}`} variant="secondary" className="bg-amber-500/15 text-amber-200">
                                {member.communityValue}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("communities.panel.details.members")}</div>
                        {selectedSet.members.length === 0 ? (
                          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                            {t("communities.panel.details.noMembers")}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {selectedSet.members.map((member) => (
                              <SetMemberRow
                                key={`${selectedSet.id}-${member.position}-${member.communityValue}`}
                                member={member}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 rounded-lg border border-[#252840] bg-[#11141c] p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("communities.panel.details.actions")}</div>
                        {canManage && !isImportedOrigin(selectedSet.origin) ? (
                          <div className="space-y-1.5">
                            <label className="space-y-1.5 text-sm">
                              <span className="text-muted-foreground">{t("communities.panel.details.name")}</span>
                              <Input value={name} onChange={(event) => setName(event.target.value)} className="border-[#252840] bg-[#10131a] text-foreground" />
                            </label>
                            <label className="space-y-1.5 text-sm">
                              <span className="text-muted-foreground">{t("communities.panel.details.slug")}</span>
                              <Input value={slug} onChange={(event) => setSlug(event.target.value)} className="border-[#252840] bg-[#10131a] text-foreground" />
                            </label>
                            <label className="space-y-1.5 text-sm">
                              <span className="text-muted-foreground">{t("communities.panel.details.vrpObjectName")}</span>
                              <Input
                                value={vrpObjectName}
                                onChange={(event) => setVrpObjectName(event.target.value)}
                                className="border-[#252840] bg-[#10131a] font-mono text-foreground"
                              />
                            </label>
                            <label className="space-y-1.5 text-sm">
                              <span className="text-muted-foreground">{t("communities.panel.details.descriptionLabel")}</span>
                              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-24 border-[#252840] bg-[#10131a] text-foreground" />
                            </label>
                            <div className="flex flex-col gap-2">
                              <Button onClick={() => void saveEditor()} disabled={updateMutation.isPending || !name.trim()} className="bg-brand-blue text-white hover:bg-brand-blue-hover">
                                <Save className="mr-2 h-4 w-4" />
                                {t("communities.panel.details.saveChanges")}
                              </Button>
                              <Button variant="outline" onClick={() => void handlePreview()} disabled={previewQuery.isFetching} className="border-[#252840] text-muted-foreground hover:border-brand-blue hover:text-brand-blue">
                                <Eye className="mr-2 h-4 w-4" />
                                {t("communities.panel.details.preview")}
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => void handleApply()}
                                disabled={applyMutation.isPending || !previewResult}
                                className="border-[#252840] text-muted-foreground hover:border-sky-500/50 hover:text-sky-300"
                              >
                                {t("communities.panel.details.saveAndApply")}
                              </Button>
                              <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleteMutation.isPending}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t("communities.panel.details.delete")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2 text-sm text-muted-foreground">
                            <p>{t("communities.panel.details.importedNotEditable")}</p>
                            <p>{t("communities.panel.details.importedSyncHint")}</p>
                          </div>
                        )}
                        <div className="pt-1 text-xs text-muted-foreground">
                          {previewResult ? t("communities.panel.details.previewAvailable") : t("communities.panel.details.previewRequired")}
                        </div>
                        {selectedSet ? (
                          <div className="space-y-2 border-t border-border pt-2">
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("communities.panel.details.compareSets")}</div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <select
                                value={compareSetId ?? ""}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setCompareSetId(value ? Number(value) : null);
                                }}
                                className="min-w-0 flex-1 rounded-md border border-[#252840] bg-[#11141c] px-3 py-2 text-sm text-foreground"
                              >
                                <option value="">{t("communities.panel.details.selectOtherSet")}</option>
                                {allSets
                                  .filter((set) => set.id !== selectedSet.id)
                                  .map((set) => (
                                    <option key={set.id} value={set.id}>
                                      {set.name} · {set.vrpObjectName}
                                    </option>
                                  ))}
                              </select>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCompareDialogOpen(true)}
                                disabled={!compareSetId || compareSetId === selectedSet.id}
                                className="border-[#252840] text-muted-foreground hover:border-amber-500/50 hover:text-amber-200"
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                {t("communities.panel.sets.compare")}
                              </Button>
                            </div>
                            {compareQuery.data && compareSet ? (
                              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                <Badge variant="secondary" className="border-[#252840] bg-[#161922] text-[10px] text-muted-foreground">
                                  {t("communities.panel.sets.membersCount", { count: selectedSet.membersTotal })}
                                </Badge>
                                <Badge variant="secondary" className="border-[#252840] bg-[#161922] text-[10px] text-muted-foreground">
                                  {t("communities.panel.sets.membersCount", { count: compareSet.membersTotal })}
                                </Badge>
                                <Badge variant="secondary" className="border-[#252840] bg-[#161922] text-[10px] text-muted-foreground">
                                  {compareQuery.data.sameMembers
                                    ? t("communities.panel.details.sameMembers")
                                    : t("communities.panel.details.differences", {
                                        count: compareQuery.data.onlyInA.length + compareQuery.data.onlyInB.length,
                                      })}
                                </Badge>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {selectedSet.impliedConfigPreview ? (
                        <div className="space-y-1.5">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("communities.panel.details.impliedPreview")}
                          </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => void copyToClipboard(selectedSet.impliedConfigPreview ?? "", t("communities.toasts.labels.vrpBlock"))} className="border-[#252840] text-muted-foreground hover:border-brand-blue hover:text-brand-blue">
                            <Copy className="mr-2 h-4 w-4" />
                            {t("communities.panel.details.copyBlock")}
                          </Button>
                          {previewResult?.candidateSha256 ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void copyToClipboard(previewResult.candidateSha256, t("communities.toasts.labels.sha256"))}
                              className="border-[#252840] text-muted-foreground hover:border-brand-blue hover:text-brand-blue"
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              {t("communities.panel.details.copySha")}
                            </Button>
                          ) : null}
                        </div>
                        <pre className="overflow-auto rounded-lg border border-[#252840] bg-[#11141c] p-3 text-xs leading-4 text-foreground">
                          {selectedSet.impliedConfigPreview}
                        </pre>
                      </div>
                    ) : null}

                    {previewResult ? (
                      <div className="space-y-2 rounded-lg border border-[#252840] bg-[#11141c] p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("communities.panel.details.realPreview")}</div>
                        {previewResult.warnings.length > 0 ? (
                          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-700">
                            <ul className="list-disc space-y-1 pl-4">
                              {previewResult.warnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-lg border border-[#252840] bg-[#11141c] p-3">
                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("communities.toasts.labels.sha256")}</div>
                            <div className="mt-1 break-all font-mono text-xs text-foreground">{previewResult.candidateSha256}</div>
                          </div>
                          <div className="rounded-lg border border-[#252840] bg-[#11141c] p-3 text-sm text-muted-foreground">
                            <div>{t("communities.panel.details.membersWithoutLibrary", { count: previewResult.membersMissingLibrary })}</div>
                            <div>{t("communities.panel.details.missingValues", { count: previewResult.missingCommunityValues.length })}</div>
                          </div>
                        </div>
                        <pre className="max-h-52 overflow-auto rounded-lg border border-[#252840] bg-[#11141c] p-3 text-xs leading-4 text-foreground">
                          {previewResult.candidateConfigText}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    {t("communities.panel.details.selectSetHint")}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={compareDialogOpen && Boolean(selectedSet && compareSet)}
        onOpenChange={(open) => setCompareDialogOpen(open)}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden rounded-2xl border border-[#252840] bg-[#10131a] p-0 text-foreground shadow-2xl">
          <DialogHeader className="flex items-center justify-between gap-2 border-b border-[#252840] px-6 py-4 text-left">
            <div>
              <DialogTitle className="text-[15px] font-semibold text-foreground">{t("communities.compare.title")}</DialogTitle>
              <DialogDescription className="text-[12px] text-muted-foreground">
                {t("communities.compare.description")}
              </DialogDescription>
            </div>
          </DialogHeader>

          {selectedSet && compareSet ? (
            <div className="max-h-[calc(90vh-88px)] space-y-4 overflow-y-auto px-6 py-5">
              {compareQuery.isLoading ? (
                <div className="rounded-lg border border-dashed border-[#252840] p-6 text-sm text-muted-foreground">
                  {t("communities.compare.loading")}
                </div>
              ) : compareQuery.data ? (
                <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="border-[#252840] bg-[#161922] text-muted-foreground">
                  {selectedSet.name}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <Badge variant="secondary" className="border-[#252840] bg-[#161922] text-muted-foreground">
                  {compareSet.name}
                </Badge>
                <Badge variant="secondary" className="border-[#252840] bg-[#161922] text-[10px] text-muted-foreground">
                  {compareQuery.data.sameMembers
                    ? t("communities.panel.details.sameMembers")
                    : t("communities.panel.details.differences", {
                        count: compareQuery.data.onlyInA.length + compareQuery.data.onlyInB.length,
                      })}
                </Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-[#252840] bg-[#11141c] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("communities.compare.inBoth")}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {compareQuery.data.inBoth.length > 0 ? (
                      compareQuery.data.inBoth.map((value) => (
                        <Badge key={value} variant="secondary" className="bg-emerald-500/15 text-emerald-200">
                          {value}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("communities.compare.none")}</span>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-[#252840] bg-[#11141c] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("communities.compare.onlyInA")}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {compareQuery.data.onlyInA.length > 0 ? (
                      compareQuery.data.onlyInA.map((value) => (
                        <Badge key={value} variant="secondary" className="bg-sky-500/15 text-sky-200">
                          {value}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("communities.compare.none")}</span>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-[#252840] bg-[#11141c] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("communities.compare.onlyInB")}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {compareQuery.data.onlyInB.length > 0 ? (
                      compareQuery.data.onlyInB.map((value) => (
                        <Badge key={value} variant="secondary" className="bg-amber-500/15 text-amber-200">
                          {value}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("communities.compare.none")}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-[#252840] bg-[#11141c] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("communities.compare.missingRefs", { name: selectedSet.name })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {compareQuery.data.missingInA.length > 0 ? (
                      compareQuery.data.missingInA.map((value) => (
                        <Badge key={value} variant="secondary" className="bg-amber-500/15 text-amber-200">
                          {value}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("communities.compare.noneFeminine")}</span>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-[#252840] bg-[#11141c] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("communities.compare.missingRefs", { name: compareSet.name })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {compareQuery.data.missingInB.length > 0 ? (
                      compareQuery.data.missingInB.map((value) => (
                        <Badge key={value} variant="secondary" className="bg-amber-500/15 text-amber-200">
                          {value}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("communities.compare.noneFeminine")}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void copyToClipboard(
                      [
                        `left: ${selectedSet.name}`,
                        `right: ${compareSet.name}`,
                        `only_in_a: ${compareQuery.data.onlyInA.join(", ") || "-"}`,
                        `only_in_b: ${compareQuery.data.onlyInB.join(", ") || "-"}`,
                        `in_both: ${compareQuery.data.inBoth.join(", ") || "-"}`,
                      ].join("\n"),
                      t("communities.toasts.labels.comparison"),
                    )
                  }
                  className="border-[#252840] text-muted-foreground hover:border-brand-blue hover:text-brand-blue"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {t("communities.compare.copyDiff")}
                </Button>
              </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-[#252840] p-6 text-sm text-muted-foreground">
                  {t("communities.compare.loadFailed")}
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <CommunityApplyConfirmModal
        open={applyDialogOpen && Boolean(selectedSet && previewResult)}
        onOpenChange={setApplyDialogOpen}
        warnings={previewResult?.warnings ?? []}
        missingRefs={previewResult?.missingCommunityValues ?? []}
        candidateConfigText={previewResult?.candidateConfigText ?? ""}
        candidateSha256={previewResult?.candidateSha256 ?? ""}
        onConfirm={confirmApplySet}
        isPending={pendingApply || applyMutation.isPending}
      />

      {selectedSet && previewResult?.candidateSha256 && !creatingNew ? (
        <div className="hidden" />
      ) : null}
    </div>
  );
}

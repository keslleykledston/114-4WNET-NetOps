import { useCommunityLibraryItems } from "@/features/device-discovery/community-api";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";

interface CommunityLibraryTabProps {
  deviceId: number;
}

export function CommunityLibraryTab({ deviceId }: CommunityLibraryTabProps) {
  const { data: items, isLoading, error } = useCommunityLibraryItems(deviceId);

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-slate-400">
        Carregando biblioteca de comunidades...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-400 flex gap-2">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span>Erro ao carregar biblioteca</span>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-400">
        Nenhum filtro de comunidade descoberto
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="text-sm font-medium text-slate-200 mb-4">
        {items.length} filtros descobertos
      </div>

      <div className="space-y-2">
        {items.map((item: any) => (
          <div
            key={`${item.filterName}-${item.communityValue}-${item.matchType}`}
            className="rounded-lg bg-slate-900/50 border border-slate-800 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-100">
                  {item.filterName}
                </p>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  {item.communityValue}
                </p>
                {item.description && (
                  <p className="text-xs text-slate-500 mt-2">
                    {item.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    item.matchType === "advanced"
                      ? "bg-purple-500/10 border-purple-500/25 text-purple-300"
                      : "bg-blue-500/10 border-blue-500/25 text-blue-300"
                  }`}
                >
                  {item.matchType}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    item.action === "permit"
                      ? "bg-green-500/10 border-green-500/25 text-green-300"
                      : "bg-red-500/10 border-red-500/25 text-red-300"
                  }`}
                >
                  {item.action}
                </Badge>
              </div>
            </div>
            {item.usageCount > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                Referências: {item.usageCount}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

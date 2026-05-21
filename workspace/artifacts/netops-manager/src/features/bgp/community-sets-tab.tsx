import { useCommunitySets } from "@/features/device-discovery/community-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Edit2, Trash2 } from "lucide-react";

interface CommunitySetsTabProps {
  deviceId: number;
}

export function CommunitySetsTab({ deviceId }: CommunitySetsTabProps) {
  const { data: sets, isLoading, error } = useCommunitySets(deviceId);

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-slate-400">
        Carregando conjuntos de comunidades...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-400 flex gap-2">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span>Erro ao carregar conjuntos</span>
      </div>
    );
  }

  if (!sets || sets.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-400">
        Nenhum conjunto de comunidades criado
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="text-sm font-medium text-slate-200 mb-4">
        {sets.length} conjuntos configurados
      </div>

      <div className="space-y-2">
        {sets.map((set: any) => (
          <div
            key={set.id}
            className="rounded-lg bg-slate-900/50 border border-slate-800 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-100">
                  {set.name}
                </p>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  {set.vrpObjectName}
                </p>
                {set.description && (
                  <p className="text-xs text-slate-500 mt-2">
                    {set.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                  <span>Membros: {set.membersTotal}</span>
                  {set.membersMissing > 0 && (
                    <span className="text-amber-400">
                      ({set.membersMissing} não resolvidos)
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    set.status === "applied"
                      ? "bg-green-500/10 border-green-500/25 text-green-300"
                      : set.status === "ready"
                        ? "bg-blue-500/10 border-blue-500/25 text-blue-300"
                        : "bg-slate-500/10 border-slate-500/25 text-slate-300"
                  }`}
                >
                  {set.status}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-slate-800"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

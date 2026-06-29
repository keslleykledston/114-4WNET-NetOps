import { useListNetopsDeviceFilters } from "@workspace/api-client-react";
import type { Device } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Filter } from "lucide-react";
import { useTranslation } from "@/i18n";

export function FiltersPanel({ device }: { device: Device }) {
  const { t } = useTranslation();
  const { data: filters, isLoading, isError } = useListNetopsDeviceFilters(device.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Filter className="h-5 w-5" />
          {t("deviceInventory.filtersPanel.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {t("deviceInventory.filtersPanel.loadFailed")}
          </div>
        ) : !filters?.length ? (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t("deviceInventory.filtersPanel.noFilters", { hostname: device.hostname })}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("deviceInventory.filtersPanel.columns.name")}</TableHead>
                <TableHead>{t("deviceInventory.filtersPanel.columns.type")}</TableHead>
                <TableHead>{t("deviceInventory.filtersPanel.columns.entries")}</TableHead>
                <TableHead>{t("deviceInventory.filtersPanel.columns.source")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filters.map((filter) => (
                <TableRow key={`${filter.name}-${filter.type}`}>
                  <TableCell className="font-mono">{filter.name}</TableCell>
                  <TableCell>{filter.type}</TableCell>
                  <TableCell>{filter.entries.length}</TableCell>
                  <TableCell className="text-muted-foreground">{filter.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

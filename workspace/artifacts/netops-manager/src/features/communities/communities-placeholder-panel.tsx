import { useListNetopsDeviceCommunities } from "@workspace/api-client-react";
import type { Device } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tags } from "lucide-react";

export function CommunitiesPanel({ device }: { device: Device }) {
  const { data: communities, isLoading, isError } = useListNetopsDeviceCommunities(device.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Tags className="h-5 w-5" />
          Communities
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load communities.
          </div>
        ) : !communities?.length ? (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No communities found for {device.hostname}.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Entries</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {communities.map((community) => (
                <TableRow key={`${community.name}-${community.type}`}>
                  <TableCell className="font-mono">{community.name}</TableCell>
                  <TableCell>{community.type}</TableCell>
                  <TableCell>{community.entries.length}</TableCell>
                  <TableCell className="text-muted-foreground">{community.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

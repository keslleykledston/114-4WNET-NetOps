import type { ComplianceFindingGroup } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye } from "lucide-react";
import { OperationalCategoryBadge } from "./operational-category-badge";

interface ComplianceFindingGroupTableProps {
  groups: ComplianceFindingGroup[] | undefined;
  isLoading?: boolean;
  badgeClass: (value: string | null | undefined) => string;
  onSelectGroup: (group: ComplianceFindingGroup) => void;
}

export function ComplianceFindingGroupTable({
  groups,
  isLoading,
  badgeClass,
  onSelectGroup,
}: ComplianceFindingGroupTableProps) {
  return (
    <div className="border-t">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rule</TableHead>
            <TableHead>Context</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Categoria operacional</TableHead>
            <TableHead className="text-right">Count</TableHead>
            <TableHead>Sample findings</TableHead>
            <TableHead>Mensagem normalizada</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={8} className="text-center py-8">Loading...</TableCell></TableRow>
          ) : groups?.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No groups.</TableCell></TableRow>
          ) : groups?.map((group) => (
            <TableRow key={`${group.ruleId}-${group.context}-${group.severity}-${group.operationalCategory}-${group.message}`}>
              <TableCell>
                <div className="font-mono text-xs text-foreground">{group.ruleId}</div>
                <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                  {group.ruleName ?? group.policyName ?? "-"}
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">{group.context}</TableCell>
              <TableCell><Badge variant="outline" className={badgeClass(group.severity)}>{group.severity}</Badge></TableCell>
              <TableCell><OperationalCategoryBadge value={group.operationalCategory} /></TableCell>
              <TableCell className="text-right font-semibold">{group.count}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {group.sampleFindingIds.map((id) => (
                    <Badge key={id} variant="secondary" className="font-mono text-[10px]">#{id}</Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="max-w-[420px] truncate">{group.message}</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => onSelectGroup(group)}>
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

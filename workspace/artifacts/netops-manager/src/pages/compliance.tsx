import { useState } from "react";
import { 
  useListComplianceJobs, getListComplianceJobsQueryKey,
  useCreateComplianceJob,
  useGetComplianceSummary,
  useListDevices
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldCheck, Plus, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ALL_CONTEXTS = ["sysname", "vlan", "bgp", "ntp", "snmp", "interface", "l2vpn", "l3vpn", "security"];

export default function Compliance() {
  const { data: summary } = useGetComplianceSummary();
  const { data: jobs, isLoading } = useListComplianceJobs();
  const { data: devices } = useListDevices();
  const createJob = useCreateComplianceJob();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [selectedContexts, setSelectedContexts] = useState<string[]>([]);

  const handleCreate = () => {
    if (!selectedDevice || selectedContexts.length === 0) {
      toast({ title: "Validation Error", description: "Select a device and at least one context.", variant: "destructive" });
      return;
    }

    createJob.mutate({ 
      data: { 
        deviceId: parseInt(selectedDevice), 
        contexts: selectedContexts 
      } 
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListComplianceJobsQueryKey() });
        setIsCreateOpen(false);
        setSelectedDevice("");
        setSelectedContexts([]);
        toast({ title: "Compliance job started" });
      }
    });
  };

  const toggleContext = (ctx: string) => {
    setSelectedContexts(prev => 
      prev.includes(ctx) ? prev.filter(c => c !== ctx) : [...prev, ctx]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compliance</h1>
          <p className="text-muted-foreground mt-1">Run and monitor policy checks across the fleet</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Run Check
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Run Compliance Check</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Target Device</label>
                <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                  <SelectTrigger><SelectValue placeholder="Select a device" /></SelectTrigger>
                  <SelectContent>
                    {devices?.map(d => (
                      <SelectItem key={d.id} value={d.id.toString()}>{d.hostname} ({d.ipAddress})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Policy Contexts</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {ALL_CONTEXTS.map(ctx => (
                    <div key={ctx} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`ctx-${ctx}`} 
                        checked={selectedContexts.includes(ctx)}
                        onCheckedChange={() => toggleContext(ctx)}
                      />
                      <label htmlFor={`ctx-${ctx}`} className="text-sm font-mono cursor-pointer">{ctx}</label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createJob.isPending}>
                {createJob.isPending ? "Starting..." : "Run Job"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between">
              Total Runs <ShieldCheck className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{summary?.totalJobs || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between">
              Passed <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-500">{summary?.passed || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between">
              Failed <AlertCircle className="h-4 w-4 text-destructive" />
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{summary?.failed || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between">
              Running <Clock className="h-4 w-4 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-500">{summary?.running || 0}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Compliance Job History</CardTitle>
          <CardDescription>Recent policy evaluation runs</CardDescription>
        </CardHeader>
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Target Device</TableHead>
                <TableHead>Contexts</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Findings</TableHead>
                <TableHead>Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : jobs?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No compliance jobs found.</TableCell></TableRow>
              ) : (
                jobs?.map(job => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-sm">#{job.id}</TableCell>
                    <TableCell className="font-medium">{job.deviceHostname}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {job.contexts.map(c => (
                          <Badge key={c} variant="secondary" className="text-[10px] font-mono">{c}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        job.status === 'passed' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 
                        job.status === 'failed' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                        job.status === 'running' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : ''
                      }>{job.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">
                        <span className="text-green-500 mr-2">{job.passCount} pass</span>
                        <span className="text-red-500">{job.failCount} fail</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.completedAt ? new Date(job.completedAt).toLocaleString() : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
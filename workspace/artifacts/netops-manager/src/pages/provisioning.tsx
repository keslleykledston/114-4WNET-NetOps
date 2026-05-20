import { useState } from "react";
import { 
  useListProvisioningJobs, getListProvisioningJobsQueryKey,
  useCreateProvisioningJob,
  useListDevices,
  useListConfigTemplates
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Rocket, Plus, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Provisioning() {
  const { data: jobs, isLoading } = useListProvisioningJobs();
  const { data: devices } = useListDevices();
  const { data: templates } = useListConfigTemplates();
  const createJob = useCreateProvisioningJob();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newJob, setNewJob] = useState({
    name: "",
    type: "l3vpn",
    deviceIds: [] as number[],
    templateId: undefined as number | undefined,
    parameters: "{}"
  });

  const handleCreate = () => {
    if (!newJob.name || newJob.deviceIds.length === 0) {
      toast({ title: "Validation Error", description: "Name and at least one device are required.", variant: "destructive" });
      return;
    }

    createJob.mutate({ 
      data: {
        name: newJob.name,
        type: newJob.type,
        deviceIds: newJob.deviceIds,
        templateId: newJob.templateId,
        parameters: newJob.parameters
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
        setIsCreateOpen(false);
        toast({ title: "Provisioning job drafted" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Provisioning</h1>
          <p className="text-muted-foreground mt-1">Deploy services and configurations</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Job
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Provisioning Job</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Job Name</label>
                <Input 
                  value={newJob.name} 
                  onChange={e => setNewJob({...newJob, name: e.target.value})} 
                  placeholder="e.g. Acme Corp L3VPN Turn-up"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Service Type</label>
                <Select value={newJob.type} onValueChange={v => setNewJob({...newJob, type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="l2vpn">L2VPN (VLL/VPLS)</SelectItem>
                    <SelectItem value="l3vpn">L3VPN (VRF)</SelectItem>
                    <SelectItem value="vlan">VLAN Provisioning</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Target Device (Primary)</label>
                <Select onValueChange={v => setNewJob({...newJob, deviceIds: [parseInt(v)]})}>
                  <SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger>
                  <SelectContent>
                    {devices?.map(d => (
                      <SelectItem key={d.id} value={d.id.toString()}>{d.hostname}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Template (Optional)</label>
                <Select onValueChange={v => setNewJob({...newJob, templateId: parseInt(v)})}>
                  <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                  <SelectContent>
                    {templates?.filter(t => t.type === newJob.type).map(t => (
                      <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createJob.isPending}>
                {createJob.isPending ? "Creating..." : "Create Draft"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provisioning Jobs</CardTitle>
        </CardHeader>
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : jobs?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No provisioning jobs found.</TableCell></TableRow>
              ) : (
                jobs?.map(job => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-sm text-muted-foreground">#{job.id}</TableCell>
                    <TableCell className="font-medium">{job.name}</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase text-[10px]">{job.type}</Badge></TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={
                        job.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                        job.status === 'executing' ? 'bg-blue-500/10 text-blue-500' :
                        job.status === 'failed' ? 'bg-red-500/10 text-red-500' : ''
                      }>{job.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(job.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        <Settings2 className="h-4 w-4 mr-2" />
                        Manage
                      </Button>
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
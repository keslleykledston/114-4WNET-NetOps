import { useState } from "react";
import { useListDevices, useCreateDevice, getListDevicesQueryKey, useTestDeviceConnection, useDeleteDevice } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Server, Plus, Search, Trash2, Activity, TerminalSquare, SearchX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function Devices() {
  const [search, setSearch] = useState("");
  const { data: devices, isLoading } = useListDevices();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createDevice = useCreateDevice();
  const deleteDevice = useDeleteDevice();
  const testConnection = useTestDeviceConnection();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newDevice, setNewDevice] = useState({
    hostname: "",
    ipAddress: "",
    vendor: "cisco",
    platform: "ios",
    username: "",
    password: "",
    site: "",
    sshPort: 22
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createDevice.mutate({ data: newDevice }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
        setIsCreateOpen(false);
        toast({ title: "Device added successfully" });
      },
      onError: (err: any) => {
        toast({ title: "Error adding device", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this device?")) {
      deleteDevice.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
          toast({ title: "Device deleted" });
        }
      });
    }
  };

  const handleTestConnection = (id: number) => {
    toast({ title: "Testing connection..." });
    testConnection.mutate({ id }, {
      onSuccess: (res) => {
        toast({ 
          title: res.success ? "Connection Successful" : "Connection Failed", 
          description: res.message,
          variant: res.success ? "default" : "destructive"
        });
      }
    });
  };

  const filteredDevices = devices?.filter(d => 
    d.hostname.toLowerCase().includes(search.toLowerCase()) || 
    d.ipAddress.includes(search)
  ) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Devices</h1>
          <p className="text-muted-foreground mt-1">Manage network infrastructure inventory</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Device
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register New Device</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Hostname</Label>
                  <Input required value={newDevice.hostname} onChange={e => setNewDevice({...newDevice, hostname: e.target.value})} placeholder="pe01.nyc" />
                </div>
                <div className="space-y-2">
                  <Label>IP Address</Label>
                  <Input required className="font-mono" value={newDevice.ipAddress} onChange={e => setNewDevice({...newDevice, ipAddress: e.target.value})} placeholder="10.0.0.1" />
                </div>
                <div className="space-y-2">
                  <Label>Vendor</Label>
                  <Select value={newDevice.vendor} onValueChange={v => setNewDevice({...newDevice, vendor: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cisco">Cisco</SelectItem>
                      <SelectItem value="juniper">Juniper</SelectItem>
                      <SelectItem value="huawei">Huawei</SelectItem>
                      <SelectItem value="nokia">Nokia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Select value={newDevice.platform} onValueChange={v => setNewDevice({...newDevice, platform: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ios">IOS</SelectItem>
                      <SelectItem value="ios-xe">IOS-XE</SelectItem>
                      <SelectItem value="ios-xr">IOS-XR</SelectItem>
                      <SelectItem value="junos">Junos</SelectItem>
                      <SelectItem value="vrp">VRP</SelectItem>
                      <SelectItem value="sros">SR-OS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Site</Label>
                  <Input required value={newDevice.site} onChange={e => setNewDevice({...newDevice, site: e.target.value})} placeholder="NYC-DC1" />
                </div>
                <div className="space-y-2">
                  <Label>SSH Port</Label>
                  <Input required type="number" value={newDevice.sshPort} onChange={e => setNewDevice({...newDevice, sshPort: parseInt(e.target.value)})} />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input required value={newDevice.username} onChange={e => setNewDevice({...newDevice, username: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input required type="password" value={newDevice.password} onChange={e => setNewDevice({...newDevice, password: e.target.value})} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createDevice.isPending}>
                  {createDevice.isPending ? "Adding..." : "Add Device"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="py-4">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search hostname or IP..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm border-0 shadow-none focus-visible:ring-0 px-0"
            />
          </div>
        </CardHeader>
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hostname</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Vendor / OS</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">Loading devices...</TableCell>
                </TableRow>
              ) : filteredDevices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <SearchX className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No devices found matching your search.
                  </TableCell>
                </TableRow>
              ) : (
                filteredDevices.map(device => (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium">
                      <Link href={`/devices/${device.id}`} className="hover:underline text-primary">
                        {device.hostname}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{device.ipAddress}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="capitalize">{device.vendor}</span>
                        <Badge variant="outline" className="text-[10px] uppercase">{device.platform}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>{device.site}</TableCell>
                    <TableCell>
                      <Badge variant={device.status === 'active' ? 'default' : device.status === 'unreachable' ? 'destructive' : 'secondary'}
                        className={device.status === 'active' ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20' : ''}
                      >
                        {device.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="ghost" size="icon" onClick={() => handleTestConnection(device.id)} title="Test Connection">
                        <Activity className="h-4 w-4" />
                      </Button>
                      <Link href={`/devices/${device.id}`}>
                        <Button variant="ghost" size="icon" title="View Details">
                          <TerminalSquare className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(device.id)} title="Delete">
                        <Trash2 className="h-4 w-4" />
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
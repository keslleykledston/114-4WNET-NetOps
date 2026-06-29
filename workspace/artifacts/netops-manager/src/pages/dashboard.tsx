import { useHealthCheck, useGetDeviceStats, useGetComplianceSummary, useGetProvisioningStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Server, Activity, AlertTriangle, ShieldCheck, Rocket } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/i18n";

export default function Dashboard() {
  const { t } = useTranslation();
  const { data: stats, isLoading: statsLoading } = useGetDeviceStats();
  const { data: compliance, isLoading: complianceLoading } = useGetComplianceSummary();
  const { data: provisioning, isLoading: provisioningLoading } = useGetProvisioningStats();
  const { data: health } = useHealthCheck();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.title")}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("dashboard.apiStatus")}</span>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
            <div className={`h-2 w-2 rounded-full ${health?.status === "ok" ? "bg-green-500" : "bg-red-500"}`} />
            {health?.status === "ok" ? t("common.online") : t("common.offline")}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("dashboard.totalDevices")}</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-total-devices">{stats?.total || 0}</div>
                <div className="flex items-center gap-2 mt-1 text-xs">
                  <span className="text-green-500 font-medium">{stats?.active || 0} {t("dashboard.active")}</span>
                  <span className="text-red-500 font-medium">{stats?.unreachable || 0} {t("dashboard.unreachable")}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("dashboard.complianceHealth")}</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {complianceLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-compliance-passed">{compliance?.passed || 0}</div>
                <div className="text-xs text-muted-foreground mt-1">{t("dashboard.policiesPassed")}</div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("dashboard.complianceFailures")}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {complianceLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold text-destructive" data-testid="text-compliance-failed">{compliance?.failed || 0}</div>
                <div className="text-xs text-muted-foreground mt-1">{t("dashboard.activeViolations")}</div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("dashboard.activeProvisioning")}</CardTitle>
            <Rocket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {provisioningLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-provisioning-active">{provisioning?.executing || 0}</div>
                <div className="text-xs text-muted-foreground mt-1">{t("dashboard.jobsExecuting")}</div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.recentComplianceJobs")}</CardTitle>
          </CardHeader>
          <CardContent>
             {complianceLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : compliance?.recentJobs?.length ? (
              <div className="space-y-4">
                {compliance.recentJobs.map(job => (
                  <div key={job.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                    <div>
                      <div className="font-medium">{job.deviceHostname || `Device #${job.deviceId}`}</div>
                      <div className="text-xs text-muted-foreground font-mono">{job.contexts.join(', ')}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs flex gap-2">
                        <span className="text-green-500">{job.passCount} {t("dashboard.pass")}</span>
                        <span className="text-red-500">{job.failCount} {t("dashboard.fail")}</span>
                      </div>
                      <div className={`px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider ${
                        job.status === 'passed' ? 'bg-green-500/10 text-green-500' : 
                        job.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                        job.status === 'running' ? 'bg-blue-500/10 text-blue-500' :
                        'bg-gray-500/10 text-gray-500'
                      }`}>
                        {job.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">{t("dashboard.noRecentJobs")}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.fleetComposition")}</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
               <Skeleton className="h-40 w-full" />
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">{t("dashboard.byVendor")}</h4>
                  <div className="space-y-2">
                    {stats?.byVendor.map(v => (
                      <div key={v.key} className="flex items-center justify-between">
                        <span className="text-sm capitalize">{v.key}</span>
                        <span className="text-sm font-mono">{v.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

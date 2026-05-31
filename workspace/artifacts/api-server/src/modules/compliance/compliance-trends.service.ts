import { and, eq, desc, gte } from "drizzle-orm";
import {
  db,
  complianceJobsTable,
  complianceFindingsTable,
  complianceTrendsTable,
  devicesTable,
  type ComplianceTrend,
} from "@workspace/db";
import { calculateComplianceScore } from "./compliance-engine.js";

function getTodayDate(): string {
  const today = new Date();
  return today.toISOString().split("T")[0]; // YYYY-MM-DD
}

export async function snapshotComplianceTrends(): Promise<void> {
  const today = getTodayDate();

  // Check if snapshot already exists for today
  const existingToday = await db
    .select({ id: complianceTrendsTable.id })
    .from(complianceTrendsTable)
    .where(eq(complianceTrendsTable.snapshotDate, today))
    .limit(1);

  if (existingToday.length > 0) {
    return; // Already snapshotted today
  }

  // Get latest job per device
  const allJobs = await db
    .select({
      id: complianceJobsTable.id,
      deviceId: complianceJobsTable.deviceId,
      status: complianceJobsTable.status,
      passCount: complianceJobsTable.passCount,
      failCount: complianceJobsTable.failCount,
      createdAt: complianceJobsTable.createdAt,
    })
    .from(complianceJobsTable)
    .orderBy(desc(complianceJobsTable.createdAt));

  // Map device → latest job
  const latestByDevice = new Map<number, (typeof allJobs)[0]>();
  for (const job of allJobs) {
    if (!latestByDevice.has(job.deviceId)) {
      latestByDevice.set(job.deviceId, job);
    }
  }

  // Get device metadata (site, vendor)
  const devices = await db.select().from(devicesTable);
  const deviceMap = new Map<number, { site: string; vendor: string; hostname: string }>();
  for (const device of devices) {
    deviceMap.set(device.id, { site: device.site, vendor: device.vendor, hostname: device.hostname });
  }

  // Insert device-level snapshots
  const trendsToInsert: Array<any> = [];

  for (const [deviceId, job] of latestByDevice) {
    const deviceInfo = deviceMap.get(deviceId);
    if (!deviceInfo) continue;

    // Get findings for this job to calculate score
    const findings = await db
      .select()
      .from(complianceFindingsTable)
      .where(eq(complianceFindingsTable.jobId, job.id));

    const score = calculateComplianceScore(findings);

    trendsToInsert.push({
      deviceId,
      site: deviceInfo.site,
      vendor: deviceInfo.vendor,
      scope: "device",
      score: score.toString(), // Store as string in NUMERIC(5,2)
      passCount: job.passCount,
      failCount: job.failCount,
      totalDevices: 1,
      snapshotDate: today,
    });
  }

  // Insert site-level aggregates
  const siteScores = new Map<string, { scores: number[]; passCount: number; failCount: number }>();
  for (const trend of trendsToInsert) {
    if (!siteScores.has(trend.site)) {
      siteScores.set(trend.site, { scores: [], passCount: 0, failCount: 0 });
    }
    const siteData = siteScores.get(trend.site)!;
    siteData.scores.push(Number(trend.score));
    siteData.passCount += trend.passCount;
    siteData.failCount += trend.failCount;
  }

  for (const [site, data] of siteScores) {
    const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    trendsToInsert.push({
      deviceId: null,
      site,
      vendor: null,
      scope: "site",
      score: avgScore.toFixed(2),
      passCount: data.passCount,
      failCount: data.failCount,
      totalDevices: data.scores.length,
      snapshotDate: today,
    });
  }

  // Insert vendor-level aggregates
  const vendorScores = new Map<string, { scores: number[]; passCount: number; failCount: number }>();
  for (const trend of trendsToInsert.filter((t) => t.scope === "device")) {
    if (!vendorScores.has(trend.vendor)) {
      vendorScores.set(trend.vendor, { scores: [], passCount: 0, failCount: 0 });
    }
    const vendorData = vendorScores.get(trend.vendor)!;
    vendorData.scores.push(Number(trend.score));
    vendorData.passCount += trend.passCount;
    vendorData.failCount += trend.failCount;
  }

  for (const [vendor, data] of vendorScores) {
    const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    trendsToInsert.push({
      deviceId: null,
      site: null,
      vendor,
      scope: "vendor",
      score: avgScore.toFixed(2),
      passCount: data.passCount,
      failCount: data.failCount,
      totalDevices: data.scores.length,
      snapshotDate: today,
    });
  }

  // Insert global aggregate
  if (trendsToInsert.filter((t) => t.scope === "device").length > 0) {
    const deviceTrends = trendsToInsert.filter((t) => t.scope === "device");
    const globalScore =
      deviceTrends.reduce((sum, t) => sum + Number(t.score), 0) / deviceTrends.length;
    const globalPass = deviceTrends.reduce((sum, t) => sum + t.passCount, 0);
    const globalFail = deviceTrends.reduce((sum, t) => sum + t.failCount, 0);

    trendsToInsert.push({
      deviceId: null,
      site: null,
      vendor: null,
      scope: "global",
      score: globalScore.toFixed(2),
      passCount: globalPass,
      failCount: globalFail,
      totalDevices: deviceTrends.length,
      snapshotDate: today,
    });
  }

  // Batch insert
  if (trendsToInsert.length > 0) {
    await db.insert(complianceTrendsTable).values(trendsToInsert);
  }
}

export interface TrendQuery {
  scope: "device" | "site" | "vendor" | "global";
  scopeId?: string | number;
  days?: number;
}

export async function getTrends(params: TrendQuery): Promise<ComplianceTrend[]> {
  const days = params.days || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const minDate = startDate.toISOString().split("T")[0];

  let query = db
    .select()
    .from(complianceTrendsTable)
    .where(
      and(
        eq(complianceTrendsTable.scope, params.scope),
        gte(complianceTrendsTable.snapshotDate, minDate)
      )
    );

  if (params.scopeId) {
    if (params.scope === "device") {
      query = db
        .select()
        .from(complianceTrendsTable)
        .where(
          and(
            eq(complianceTrendsTable.scope, "device"),
            eq(complianceTrendsTable.deviceId, Number(params.scopeId)),
            gte(complianceTrendsTable.snapshotDate, minDate)
          )
        );
    } else if (params.scope === "site") {
      query = db
        .select()
        .from(complianceTrendsTable)
        .where(
          and(
            eq(complianceTrendsTable.scope, "site"),
            eq(complianceTrendsTable.site, String(params.scopeId)),
            gte(complianceTrendsTable.snapshotDate, minDate)
          )
        );
    } else if (params.scope === "vendor") {
      query = db
        .select()
        .from(complianceTrendsTable)
        .where(
          and(
            eq(complianceTrendsTable.scope, "vendor"),
            eq(complianceTrendsTable.vendor, String(params.scopeId)),
            gte(complianceTrendsTable.snapshotDate, minDate)
          )
        );
    }
  }

  return query.orderBy(complianceTrendsTable.snapshotDate);
}

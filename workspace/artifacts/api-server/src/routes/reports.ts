import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db, provisioningJobsTable, reportsTable } from "@workspace/db";

const router = Router();

router.get("/reports", async (_req, res) => {
  const rows = await db.select({
    id: reportsTable.id,
    provisioningJobId: reportsTable.provisioningJobId,
    reportType: reportsTable.reportType,
    contentMarkdown: reportsTable.contentMarkdown,
    generatedBy: reportsTable.generatedBy,
    generatedAt: reportsTable.generatedAt,
    jobName: provisioningJobsTable.name,
    jobType: provisioningJobsTable.type,
  })
    .from(reportsTable)
    .leftJoin(provisioningJobsTable, eq(reportsTable.provisioningJobId, provisioningJobsTable.id))
    .orderBy(desc(reportsTable.generatedAt))
    .limit(200);

  res.json(rows.map((row) => ({
    ...row,
    generatedAt: row.generatedAt.toISOString(),
  })));
});

router.get("/reports/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [report] = await db.select({
    id: reportsTable.id,
    provisioningJobId: reportsTable.provisioningJobId,
    reportType: reportsTable.reportType,
    contentMarkdown: reportsTable.contentMarkdown,
    generatedBy: reportsTable.generatedBy,
    generatedAt: reportsTable.generatedAt,
    jobName: provisioningJobsTable.name,
    jobType: provisioningJobsTable.type,
  })
    .from(reportsTable)
    .leftJoin(provisioningJobsTable, eq(reportsTable.provisioningJobId, provisioningJobsTable.id))
    .where(eq(reportsTable.id, id));

  if (!report) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({
    ...report,
    generatedAt: report.generatedAt.toISOString(),
  });
});

export default router;


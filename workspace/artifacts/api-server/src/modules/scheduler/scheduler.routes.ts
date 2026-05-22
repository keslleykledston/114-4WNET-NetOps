import { Router } from "express";
import {
  createSchedulerJobHandler,
  deleteSchedulerJobHandler,
  disableSchedulerJobHandler,
  enableSchedulerJobHandler,
  getSchedulerJobHandler,
  getSchedulerRunHandler,
  listSchedulerJobsHandler,
  listSchedulerRunItemsHandler,
  listSchedulerRunsHandler,
  runSchedulerJobNowHandler,
  updateSchedulerJobHandler,
} from "./scheduler.controller.js";

const router = Router();

router.get("/scheduled-jobs", listSchedulerJobsHandler);
router.post("/scheduled-jobs", createSchedulerJobHandler);
router.get("/scheduled-jobs/:id", getSchedulerJobHandler);
router.patch("/scheduled-jobs/:id", updateSchedulerJobHandler);
router.delete("/scheduled-jobs/:id", deleteSchedulerJobHandler);
router.post("/scheduled-jobs/:id/run-now", runSchedulerJobNowHandler);
router.post("/scheduled-jobs/:id/enable", enableSchedulerJobHandler);
router.post("/scheduled-jobs/:id/disable", disableSchedulerJobHandler);

router.get("/scheduled-job-runs", listSchedulerRunsHandler);
router.get("/scheduled-job-runs/:id", getSchedulerRunHandler);
router.get("/scheduled-job-runs/:id/items", listSchedulerRunItemsHandler);

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import devicesRouter from "./devices.js";
import deviceGroupsRouter from "./device_groups.js";
import complianceRouter from "./compliance.js";
import templatesRouter from "./templates.js";
import provisioningRouter from "./provisioning.js";
import collectedConfigsRouter from "./collected_configs.js";
import snmpSnapshotsRouter from "./snmp_snapshots.js";
import netopsRouter from "../modules/netops/routes.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(devicesRouter);
router.use(deviceGroupsRouter);
router.use(complianceRouter);
router.use(templatesRouter);
router.use(provisioningRouter);
router.use(collectedConfigsRouter);
router.use(snmpSnapshotsRouter);
router.use(netopsRouter);

export default router;

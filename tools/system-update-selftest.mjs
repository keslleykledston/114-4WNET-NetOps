import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

async function has(path, needle) {
  const text = await readFile(path, "utf8");
  assert(text.includes(needle), `${path} missing ${needle}`);
}

await has("workspace/lib/db/migrations/0056_system_update.sql", "system_update_runs");
await has("workspace/lib/db/src/schema/system-update.ts", "systemUpdateRunsTable");
await has("workspace/artifacts/api-server/src/modules/system-update/system-update.routes.ts", "/system/update/run");
await has("workspace/artifacts/api-server/src/modules/system-update/system-update.service.ts", "rollback_in_progress");
await has("workspace/artifacts/netops-manager/src/pages/system-update.tsx", "Atualização do Sistema");
await has("workspace/artifacts/netops-manager/src/lib/system-update-api.ts", "runSystemUpdate");
await has("docs/system-update.md", "system_update_runs");

await has("workspace/artifacts/api-server/src/modules/system-update/system-update.routes.ts", "/system/update/run");
await has("workspace/artifacts/api-server/src/modules/system-update/system-update.routes.ts", "/system/update/events/:runId");
await has("workspace/artifacts/netops-manager/src/pages/system-update.tsx", "Atualização do Sistema");
await has("workspace/artifacts/netops-manager/src/pages/system-update.tsx", "Rollback manual");
await has("workspace/artifacts/netops-manager/src/pages/system-update.tsx", "Verificar nova versão");
await has("workspace/artifacts/api-server/src/modules/system-update/system-update.service.ts", "rollback_in_progress");
await has("workspace/artifacts/api-server/src/modules/system-update/system-update.service.ts", "pg_dump");
await has("workspace/artifacts/api-server/src/modules/system-update/system-update.service.ts", "pg_restore");

console.log("system-update selftest passed");

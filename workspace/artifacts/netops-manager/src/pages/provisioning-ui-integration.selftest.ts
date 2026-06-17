import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const provisioningPage = read("src/pages/provisioning.tsx");
const configGeneratorPage = read("src/pages/config-generator.tsx");
const layout = read("src/components/layout.tsx");
const app = read("src/App.tsx");
const configGeneratorApi = read("src/features/config-generator/config-generator-api.ts");

assert(provisioningPage.includes('export { default } from "./config-generator";'), "provisioning page not alias config-generator");
assert(!provisioningPage.includes("useExecuteProvisioningJob"), "provisioning page imports legacy execute");
assert(!provisioningPage.includes("applyStructuredProvisioningJob"), "provisioning page imports legacy apply");
assert(configGeneratorPage.includes('h1 className="text-2xl font-bold tracking-tight">Provisioning</h1>'), "config-generator title not Provisioning");
assert(configGeneratorPage.includes("Config Generator engine. Preview-only."), "preview-only banner text missing");
assert(configGeneratorPage.includes("Nenhum comando será enviado ao dispositivo neste MVP."), "preview-only warning missing");
assert(configGeneratorPage.includes("Secrets não são persistidos no histórico."), "secret warning missing");
assert(configGeneratorPage.includes("Sugestões do inventory"), "inventory suggestion panel missing");
assert(configGeneratorPage.includes("Sugestões do serviço"), "service suggestion panel missing");
assert(configGeneratorPage.includes("ConfigGeneratorIdAllocatorPanel"), "id allocator panel missing");
assert(configGeneratorPage.includes("ConfigGeneratorChangeRequestPreviewPanel"), "change request preview panel missing");
assert(fs.existsSync(path.join(root, "src/features/config-generator/change-request-preview-panel.tsx")), "change request preview panel file missing");

const closureDocPath = path.join(root, "../../../docs/config-generator/CONFIG_GENERATOR_MVP_CLOSURE.md");
const closureDoc = fs.readFileSync(closureDocPath, "utf8");
assert(closureDoc.includes("CONFIG-GENERATOR.MVP-CLOSURE"), "MVP closure doc missing phase id");
assert(closureDoc.includes("Checklist de segurança"), "MVP closure security checklist missing");
assert(closureDoc.includes("Smoke test manual"), "MVP closure smoke checklist missing");
assert(closureDoc.includes("CONFIG_WRITE_ENABLED=false"), "MVP closure must document write flag");
assert(fs.existsSync(path.join(root, "src/features/config-generator/id-allocator-panel.tsx")), "id allocator panel file missing");
assert(configGeneratorApi.includes("useConfigGeneratorSuggestionScope"), "config-generator api missing suggestion scope hook");
assert(configGeneratorApi.includes("useConfigGeneratorSuggestionServiceContext"), "config-generator api missing service-context hook");
assert(!layout.includes('href: "/config-generator"'), "sidebar still exposes config-generator");
assert(app.includes('path="/config-generator"'), "config-generator technical route missing");

for (const label of ["Executar", "Aplicar", "Enviar para dispositivo", "Provisionar agora", "Provisionar"]) {
  assert(!provisioningPage.includes(label), `dangerous label still in provisioning shell: ${label}`);
}

for (const action of ["useExecuteProvisioningJob", "applyStructuredProvisioningJob", "executeProvisioningJob", "approveProvisioningJob"]) {
  assert(!provisioningPage.includes(action), `dangerous client/action still in provisioning shell: ${action}`);
}

console.log("provisioning-ui-integration.selftest: OK");

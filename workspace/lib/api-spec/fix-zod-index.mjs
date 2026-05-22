import fs from "node:fs";
import path from "node:path";

const file = path.resolve(import.meta.dirname, "..", "api-zod", "src", "index.ts");
const previewDeviceImportBody = path.resolve(import.meta.dirname, "..", "api-zod", "src", "generated", "types", "previewDeviceImportBody.ts");
const apiFile = path.resolve(import.meta.dirname, "..", "api-zod", "src", "generated", "api.ts");

fs.writeFileSync(file, 'export * from "./generated/api";\n');

// Fix Blob type in multipart form data for Node.js compatibility
try {
  const content = fs.readFileSync(previewDeviceImportBody, "utf-8");
  const fixed = content.replace(/file: Blob;/g, "file: any;");
  fs.writeFileSync(previewDeviceImportBody, fixed);
} catch (e) {
  // File might not exist, skip
}

// Fix File type reference in api.ts - replace zod.instanceof(File) with zod.any()
try {
  const content = fs.readFileSync(apiFile, "utf-8");
  const fixed = content
    .replace(/zod\.instanceof\(File\)/g, "zod.any()")
    .replace(/:\s*File\b/g, ": any");
  fs.writeFileSync(apiFile, fixed);
} catch (e) {
  // File might not exist, skip
}

import fs from "node:fs";
import path from "node:path";

const file = path.resolve(import.meta.dirname, "..", "api-zod", "src", "index.ts");

fs.writeFileSync(file, 'export * from "./generated/api";\n');

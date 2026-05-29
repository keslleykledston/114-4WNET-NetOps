#!/usr/bin/env node
/** Static bundle smoke — no browser, no network to devices. */
const webBase = process.env.WEB_BASE ?? "http://127.0.0.1:3005";

const out = { steps: [], errors: [], go: false };

function log(step, data) {
  out.steps.push({ step, ...data });
  console.log(JSON.stringify({ step, ...data }));
}

async function main() {
  const indexRes = await fetch(`${webBase}/`);
  const indexHtml = await indexRes.text();
  log("index", { status: indexRes.status, len: indexHtml.length });
  if (indexRes.status !== 200) out.errors.push("index_not_200");

  const assetMatch = indexHtml.match(/\/assets\/index-[^"]+\.js/);
  if (!assetMatch) {
    out.errors.push("js_bundle_not_found");
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }
  const assetUrl = `${webBase}${assetMatch[0]}`;
  const jsRes = await fetch(assetUrl);
  const js = await jsRes.text();
  log("bundle", { status: jsRes.status, path: assetMatch[0], bytes: js.length });

  const needles = [
    "Atualizar operacional",
    "Mostrar circuitos saudáveis",
    "L2 Circuits",
    "l2-circuits/refresh",
    "L2_OPERATIONAL_REFRESH_DISABLED",
  ];
  const found = {};
  for (const n of needles) {
    found[n] = js.includes(n);
    if (!found[n] && n !== "L2_OPERATIONAL_REFRESH_DISABLED") {
      out.errors.push(`missing_${n.replace(/\s+/g, "_")}`);
    }
  }
  log("bundle_strings", found);

  out.go = out.errors.length === 0 && indexRes.status === 200 && jsRes.status === 200;
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.go ? 0 : 1);
}

main().catch((e) => {
  out.errors.push(String(e));
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
});

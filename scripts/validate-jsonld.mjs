/**
 * Valida el JSON-LD de cada página del build con el validador de Adobe (schema.org y reglas de los
 * resultados enriquecidos de Google), sin sumarlo a las dependencias del proyecto (T88):
 *
 *   mkdir /tmp/sdv && cd /tmp/sdv && npm init -y && npm i @adobe/structured-data-validator @marbec/web-auto-extractor
 *   curl -sLo /tmp/sdv/schemaorg-all-https.jsonld https://schema.org/version/latest/schemaorg-all-https.jsonld
 *   node scripts/validate-jsonld.mjs dist/piuma-landing/browser /tmp/sdv
 *
 * Sale con 1 si hay errores. Las advertencias de campos opcionales (gtin, review…) no se listan.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [dist, sdv] = process.argv.slice(2);
if (!dist || !sdv) throw new Error("Uso: validate-jsonld.mjs <dist> <carpeta del validador>");
const resolve = createRequire(join(sdv, "package.json")).resolve;
const load = (name) => import(pathToFileURL(resolve(name)).href);
const { default: Validator } = await load("@adobe/structured-data-validator");
const { default: WebAutoExtractor } = await load("@marbec/web-auto-extractor");
const validator = new Validator(JSON.parse(readFileSync(join(sdv, "schemaorg-all-https.jsonld"), "utf8")));

let errors = 0;
const pages = readdirSync(dist, { recursive: true }).filter((f) => f.endsWith(".html")).sort();
for (const page of pages) {
  const data = new WebAutoExtractor({ addLocation: true, embedSource: ["rdfa", "microdata"] }).parse(
    readFileSync(join(dist, page), "utf8"),
  );
  const issues = (await validator.validate(data)).filter((i) => !/\(optional\)/.test(i.issueMessage));
  errors += issues.filter((i) => i.severity === "ERROR").length;
  console.log(`${page} [${Object.keys(data.jsonld ?? {}).join(", ")}]${issues.length ? "" : " OK"}`);
  const counted = new Map();
  for (const i of issues) counted.set(`${i.severity} ${i.issueMessage}`, (counted.get(`${i.severity} ${i.issueMessage}`) ?? 0) + 1);
  for (const [issue, n] of counted) console.log(`  ${issue}${n > 1 ? ` (x${n})` : ""}`);
}
console.log(`\n${pages.length} páginas, ${errors} errores`);
process.exitCode = errors ? 1 : 0;

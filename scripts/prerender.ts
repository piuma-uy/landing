/**
 * Paso posterior a `ng build` (ver package.json): una página HTML estática por URL pública del
 * catálogo, 404.html, robots.txt, sitemap.xml y llms.txt. Variables del build:
 * - SITE_URL: origen público (canonical, hreflang, sitemap, URLs absolutas de Open Graph y JSON-LD);
 *   por defecto https://piuma.uy.
 * - SITE_LASTMOD: <lastmod> del sitemap (AAAA-MM-DD); por defecto la fecha del commit que se compila,
 *   así compilar dos veces el mismo commit no cambia el sitemap.
 * - SEO_OFFERS=1: precios en el JSON-LD y en el texto, cuando el catálogo real esté cargado (B5).
 * - SITE_COMMERCE=1: la tienda vende online (commerceEnabled); cambia "cómo comprar" y "cómo pagar".
 * - SITE_ENV: prod (por defecto) o dev. En prod no se publica el borrador legal (T99): ni sus
 *   páginas ni sus enlaces. package.json pasa el mismo valor a `ng build` (PIUMA_SITE_ENV).
 */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { SITE_CONFIG } from "../src/app/core/site-config.ts";
import { type SiteEnv, publishedLegalPages } from "../src/app/core/legal-pages.ts";
import type { Category } from "../src/app/models/catalog.model.ts";
import { sortCatalogSizes } from "../src/app/core/sizes.ts";
import { NOT_FOUND_PATH, llmsTxt, prerenderPages, robotsTxt, sitemapXml, type Site } from "./seo.ts";

const out = new URL("../dist/piuma-landing/browser/", import.meta.url);
const env = process.env["SITE_ENV"] || "prod";
if (env !== "prod" && env !== "dev") throw new Error(`prerender: SITE_ENV=${env}; tiene que ser prod o dev`);
const site: Site = {
  ...SITE_CONFIG,
  url: (process.env["SITE_URL"] || "https://piuma.uy").replace(/\/+$/, ""),
  offers: process.env["SEO_OFFERS"] === "1",
  commerce: process.env["SITE_COMMERCE"] === "1",
  legalPages: publishedLegalPages(env as SiteEnv),
};

function lastmod(): string {
  const env = process.env["SITE_LASTMOD"] ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(env)) return env;
  try {
    return execFileSync("git", ["log", "-1", "--format=%cs"], { encoding: "utf8" }).trim();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const categories: Category[] = sortCatalogSizes(
  JSON.parse(await readFile(new URL("../src/assets/data/catalog.json", import.meta.url), "utf8")),
);
const pages = prerenderPages(await readFile(new URL("index.html", out), "utf8"), site, categories);
for (const page of pages) {
  if (page.path === NOT_FOUND_PATH) {
    await writeFile(new URL(`.${NOT_FOUND_PATH}`, out), page.html);
    continue;
  }
  const dir = new URL(`.${page.path}`, out);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL("index.html", dir), page.html);
}
await writeFile(new URL("robots.txt", out), robotsTxt(site));
await writeFile(new URL("sitemap.xml", out), sitemapXml(site, categories, lastmod()));
await writeFile(new URL("llms.txt", out), llmsTxt(site, categories));
console.log(
  `prerender: ${pages.length} páginas (con 404.html), robots.txt, sitemap.xml y llms.txt para ${site.url}` +
    (site.offers ? ", con precios" : "") +
    (site.legalPages.length ? "" : `, sin las páginas legales (borrador, SITE_ENV=${env})`),
);

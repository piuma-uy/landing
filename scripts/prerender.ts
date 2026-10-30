/**
 * Paso posterior a `ng build` (ver package.json): una página HTML estática por URL pública del
 * catálogo, más robots.txt y sitemap.xml. SITE_URL define el origen público (canonical, sitemap,
 * URLs absolutas de Open Graph); por defecto https://piuma.uy.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { SITE_CONFIG } from "../src/app/core/site-config.ts";
import type { Category } from "../src/app/models/catalog.model.ts";
import { sortCatalogSizes } from "../src/app/core/sizes.ts";
import { prerenderPages, robotsTxt, sitemapXml, type Site } from "./seo.ts";

const out = new URL("../dist/piuma-landing/browser/", import.meta.url);
const site: Site = {
  ...SITE_CONFIG,
  url: (process.env["SITE_URL"] || "https://piuma.uy").replace(/\/+$/, ""),
};
const categories: Category[] = sortCatalogSizes(
  JSON.parse(await readFile(new URL("../src/assets/data/catalog.json", import.meta.url), "utf8")),
);
const pages = prerenderPages(await readFile(new URL("index.html", out), "utf8"), site, categories);
for (const page of pages) {
  const dir = new URL(`.${page.path}`, out);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL("index.html", dir), page.html);
}
await writeFile(new URL("robots.txt", out), robotsTxt(site));
await writeFile(
  new URL("sitemap.xml", out),
  sitemapXml(site, categories, new Date().toISOString().slice(0, 10)),
);
console.log(`prerender: ${pages.length} páginas, robots.txt y sitemap.xml para ${site.url}`);

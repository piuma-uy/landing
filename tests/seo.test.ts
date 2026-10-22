import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SITE_CONFIG } from "../src/app/core/site-config.ts";
import type { Category } from "../src/app/models/catalog.model.ts";
import { catalogPath, pageMeta, parseCatalogPath } from "../src/app/core/catalog-seo.ts";
import { prerenderPages, robotsTxt, sitemapXml } from "../scripts/seo.ts";

const site = { ...SITE_CONFIG, url: "https://piuma.uy" };
const categories: Category[] = JSON.parse(
  await readFile(new URL("../src/assets/data/catalog.json", import.meta.url), "utf8"),
);
const index = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
const pages = prerenderPages(index, site, categories);
const page = (path: string) => pages.find((p) => p.path === path)!.html;
const jsonLd = (html: string) =>
  JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);

test("catalogPath y parseCatalogPath son inversas", () => {
  assert.equal(catalogPath(null), "/");
  assert.equal(catalogPath("sabanas"), "/catalogo/sabanas/");
  assert.equal(catalogPath("sabanas", "sabanas-saten"), "/catalogo/sabanas/sabanas-saten/");
  assert.deepEqual(parseCatalogPath("/catalogo/sabanas/sabanas-saten/"), {
    categoryId: "sabanas",
    typeId: "sabanas-saten",
  });
  assert.deepEqual(parseCatalogPath("/catalogo/sabanas"), { categoryId: "sabanas", typeId: null });
  for (const other of ["/", "/catalogo/", "/auth/callback", "/catalogo/a/b/c/", "/catalogo/A%20b/"])
    assert.equal(parseCatalogPath(other), null, other);
});

test("una página por URL pública: inicio, cada categoría y cada producto", () => {
  const products = categories.reduce((n, c) => n + c.types.length, 0);
  assert.equal(pages.length, 1 + categories.length + products);
  assert.equal(new Set(pages.map((p) => p.path)).size, pages.length);
});

test("cada página trae title, description, canonical y og propios", () => {
  const [category] = categories;
  const [type] = category.types;
  const html = page(catalogPath(category.id, type.id));
  const meta = pageMeta(site.brandName, category, type);
  assert.ok(html.includes(`<title>${type.fullName} | Piuma</title>`));
  assert.ok(meta.description.length <= 156);
  assert.ok(html.includes(`<link rel="canonical" href="https://piuma.uy${meta.path}">`));
  assert.ok(html.includes(`<meta property="og:url" content="https://piuma.uy${meta.path}">`));
  assert.ok(html.includes(`<meta property="og:image" content="https://piuma.uy/${type.image}"`));
  assert.ok(html.includes(`<h1>${type.fullName}</h1>`));
  assert.equal((html.match(/<title>/g) ?? []).length, 1);
});

test("el contenido prerenderizado se oculta con JavaScript y no agrega scripts ejecutables", () => {
  for (const { html } of pages) {
    assert.ok(html.includes("<style>.prerender{display:none}</style>"));
    assert.ok(html.includes("<noscript><style>.prerender{display:block"));
    const scripts = html.match(/<script(?![^>]*type="application\/ld\+json")[^>]*>/g) ?? [];
    assert.ok(scripts.every((s) => /src=/.test(s)), scripts.join());
  }
});

test("JSON-LD válido con Product y AggregateOffer en UYU", () => {
  const graph = jsonLd(page("/"))["@graph"];
  assert.equal(graph[0]["@type"], "Store");
  const list = graph.find((n: { "@type": string }) => n["@type"] === "ItemList");
  const product = list.itemListElement[0].item;
  assert.equal(product["@type"], "Product");
  assert.equal(product.offers.priceCurrency, "UYU");
  assert.ok(product.offers.lowPrice <= product.offers.highPrice);
  assert.ok(product.image.every((src: string) => src.startsWith("https://piuma.uy/assets/")));
  const [category] = categories;
  const detail = jsonLd(page(catalogPath(category.id, category.types[0].id)))["@graph"];
  assert.deepEqual(
    detail.map((n: { "@type": string }) => n["@type"]),
    ["Store", "Product", "BreadcrumbList"],
  );
});

test("JSON-LD no puede cerrar su <script>", () => {
  const [category] = categories;
  const types = [{ ...category.types[0], fullName: "</script><b>" }];
  const html = prerenderPages(index, site, [{ ...category, types }])[0].html;
  assert.ok(!html.includes("</script><b>"));
  assert.equal(jsonLd(html)["@graph"][2].itemListElement[0].item.name, "</script><b>");
});

test("robots.txt y sitemap.xml apuntan al dominio configurado", () => {
  assert.equal(robotsTxt(site), "User-agent: *\nAllow: /\n\nSitemap: https://piuma.uy/sitemap.xml\n");
  const xml = sitemapXml(site, categories, "2026-10-22");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, pages.map((p) => `https://piuma.uy${p.path}`));
  assert.ok(xml.includes("<lastmod>2026-10-22</lastmod>"));
});

test("sin <base href> no se puede servir en subrutas", () => {
  assert.throws(() => prerenderPages(index.replace(/<base[^>]*>/, ""), site, categories), /base href/);
});

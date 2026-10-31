import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SITE_CONFIG } from "../src/app/core/site-config.ts";
import type { Category } from "../src/app/models/catalog.model.ts";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  catalogPath,
  pageMeta,
  parseCatalogPath,
} from "../src/app/core/catalog-seo.ts";
import { sortCatalogSizes } from "../src/app/core/sizes.ts";
import { LEGAL_PAGES } from "../src/app/core/legal-pages.ts";
import {
  NOT_FOUND_PATH,
  PRIVATE_PATHS,
  llmsTxt,
  prerenderPages,
  robotsTxt,
  shareImage,
  sitemapXml,
} from "../scripts/seo.ts";

const site = { ...SITE_CONFIG, url: "https://piuma.uy", legalPages: LEGAL_PAGES };
const categories: Category[] = sortCatalogSizes(
  JSON.parse(await readFile(new URL("../src/assets/data/catalog.json", import.meta.url), "utf8")),
);
const index = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
const pages = prerenderPages(index, site, categories);
const indexable = pages.filter((p) => p.path !== NOT_FOUND_PATH);
const page = (path: string) => pages.find((p) => p.path === path)!.html;
// JSON-LD leído de vuelta: se recorre como dato suelto.
type Node = any;
const jsonLd = (html: string): Node =>
  JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]!);
const graph = (html: string): Node[] => jsonLd(html)["@graph"];
const types = (html: string) => graph(html).map((n) => n["@type"]);
const node = (html: string, type: string) => graph(html).find((n) => n["@type"] === type)!;
const meta = (html: string, attr: string, name: string) =>
  html.match(new RegExp(`<meta\\s+${attr}="${name}"\\s+content="([^"]*)"`))?.[1];
const [sabanas] = categories.filter((c) => c.id === "sabanas");
const saten = sabanas!.types.find((t) => t.id === "sabanas-saten")!;
const satenPath = catalogPath("sabanas", "sabanas-saten");

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

test("una página por URL pública: inicio, envíos, legales, cada categoría, cada producto y la 404", () => {
  const products = categories.reduce((n, c) => n + c.types.length, 0);
  assert.equal(pages.length, 3 + LEGAL_PAGES.length + categories.length + products);
  assert.equal(new Set(pages.map((p) => p.path)).size, pages.length);
  assert.equal(pages.at(-1)!.path, NOT_FOUND_PATH);
});

test("title ≤ 60 y description ≤ 155, únicos en cada página indexable (T88)", () => {
  for (const p of indexable) {
    assert.ok(p.title.length <= TITLE_MAX, `${p.path}: ${p.title}`);
    assert.ok(p.description.length <= DESCRIPTION_MAX, `${p.path}: ${p.description}`);
    assert.ok(p.description.length >= 70, `${p.path} corta: ${p.description}`);
    assert.ok(!p.description.endsWith("…"), p.description);
    assert.equal((p.html.match(/<title>/g) ?? []).length, 1);
  }
  assert.equal(new Set(indexable.map((p) => p.title)).size, indexable.length);
  assert.equal(new Set(indexable.map((p) => p.description)).size, indexable.length);
});

test("cada página trae canonical, hreflang es-UY, Open Graph y Twitter propios", async () => {
  const html = page(satenPath);
  const m = pageMeta(site.brandName, sabanas, saten);
  assert.ok(html.includes(`<title>${saten.fullName} | Piuma</title>`));
  assert.ok(html.includes(`<link rel="canonical" href="https://piuma.uy${satenPath}">`));
  assert.ok(html.includes(`<link rel="alternate" hreflang="es-UY" href="https://piuma.uy${satenPath}">`));
  assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="https://piuma.uy${satenPath}">`));
  assert.equal(meta(html, "property", "og:url"), `https://piuma.uy${satenPath}`);
  assert.equal(meta(html, "property", "og:type"), "product");
  assert.equal(meta(html, "property", "og:title"), m.title);
  assert.equal(meta(html, "name", "twitter:description"), m.description);
  assert.equal(meta(html, "property", "og:image"), "https://piuma.uy/assets/images/og/sabanas-saten.jpg");
  assert.equal(meta(html, "name", "twitter:image"), meta(html, "property", "og:image"));
  assert.equal(meta(html, "property", "og:image:alt"), saten.alt);
  assert.ok(html.includes(`<h1>${saten.fullName}</h1>`));
  assert.ok(index.includes('<html lang="es-UY">'));
  assert.equal(meta(page("/"), "property", "og:type"), "website");
});

/** Ancho y alto de un JPEG: el primer marcador SOF. */
function jpegSize(bytes: Buffer): [number, number] {
  let i = 2;
  while (i < bytes.length) {
    const marker = bytes[i + 1]!;
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
    i += 2 + length;
  }
  throw new Error("JPEG sin SOF");
}

test("la imagen para compartir de cada página existe y mide 1200x630 (scripts/og-images.py)", async () => {
  const images = [
    shareImage(null, null),
    shareImage(null, null, true),
    ...categories.flatMap((c) => [shareImage(c, null), ...c.types.map((t) => shareImage(c, t))]),
  ];
  // Las páginas legales (T89) comparten la del inicio.
  assert.equal(new Set(images.map((i) => i.path)).size, indexable.length - LEGAL_PAGES.length);
  for (const { path, alt } of images) {
    const bytes = await readFile(new URL(`../src/${path}`, import.meta.url));
    assert.deepEqual(jpegSize(bytes), [1200, 630], path);
    assert.ok(bytes.length < 150_000, `${path} pesa ${bytes.length}`);
    assert.ok(alt.length > 10, path);
  }
  for (const p of indexable) {
    assert.equal(meta(p.html, "property", "og:image:width"), "1200");
    assert.equal(meta(p.html, "property", "og:image:height"), "630");
  }
});

test("sólo el inicio precarga la foto del hero (LCP)", () => {
  const preload = /<link rel="preload" as="image" href="assets\/images\/hero-piuma.webp" fetchpriority="high"/;
  assert.match(page("/"), preload);
  for (const p of pages.filter((p) => p.path !== "/")) assert.doesNotMatch(p.html, preload, p.path);
});

test("el contenido prerenderizado se oculta con JavaScript y no agrega scripts ejecutables", () => {
  for (const { html } of pages) {
    assert.ok(html.includes("<style>.prerender{display:none}</style>"));
    assert.ok(html.includes("<noscript><style>.prerender{display:block"));
    const scripts = html.match(/<script(?![^>]*type="application\/ld\+json")[^>]*>/g) ?? [];
    assert.ok(scripts.every((s) => /src=/.test(s)), scripts.join());
  }
});

test("Piuma es una OnlineStore con logo, sameAs, WhatsApp y areaServed, sin dirección (T88)", () => {
  for (const p of indexable) {
    const [store, website] = graph(p.html);
    assert.equal(store!["@type"], "OnlineStore", p.path);
    assert.equal(website!["@type"], "WebSite", p.path);
  }
  const store = node(page("/"), "OnlineStore");
  assert.equal(store.name, "Piuma");
  assert.equal(store.url, "https://piuma.uy/");
  assert.equal(store.logo.url, "https://piuma.uy/assets/images/logo/logo-piuma-terracota.webp");
  assert.deepEqual(store.sameAs, ["https://www.instagram.com/piuma_uy/", "https://linktr.ee/piuma_uy"]);
  assert.equal(store.telephone, "+59891345454");
  assert.equal(store.contactPoint.telephone, "+59891345454");
  assert.match(store.contactPoint.url, /^https:\/\/wa\.me\/59891345454\?text=/);
  assert.deepEqual(
    store.areaServed.map((a: Node) => a.name),
    ["Uruguay", "Montevideo", "Canelones"],
  );
  // Ni la dirección fiscal ni horarios: Piuma no atiende al público en un local.
  const text = JSON.stringify(jsonLd(page("/")));
  for (const banned of ["address", "PostalAddress", "openingHours", "Valdivia", "geo"])
    assert.ok(!text.includes(`"${banned}`) && !text.includes(banned + " "), banned);
});

test("ficha: ProductGroup con variantes por medida y color, marca e imagen, sin precio (T88)", () => {
  const html = page(satenPath);
  assert.deepEqual(types(html), ["OnlineStore", "WebSite", "ItemPage", "ProductGroup", "BreadcrumbList"]);
  const group = node(html, "ProductGroup");
  assert.equal(group.productGroupID, "sabanas-saten");
  assert.equal(group.brand.name, "Piuma");
  assert.equal(group.material, "100% algodón");
  assert.deepEqual(group.variesBy, ["https://schema.org/size", "https://schema.org/color"]);
  assert.ok(group.image.every((src: string) => src.startsWith("https://piuma.uy/assets/")));
  const combos = saten.variants.reduce((n, v) => n + v.colors.length, 0);
  assert.equal(group.hasVariant.length, combos);
  assert.equal(new Set(group.hasVariant.map((v: Node) => v["@id"])).size, combos);
  const azul = group.hasVariant.find((v: Node) => v.color === "Azul");
  assert.equal(azul.image, "https://piuma.uy/assets/images/productos/producto-sabanas-saten-azul.webp");
  assert.match(azul.size, /^Twin \(160x240 cm\)$/);
  assert.equal(node(html, "ItemPage").mainEntity["@id"], group["@id"]);
  // Catálogo de demo: ningún precio ni disponibilidad en los datos ni en el texto.
  for (const p of indexable) {
    const data = JSON.stringify(jsonLd(p.html));
    for (const field of ["offers", "price", "availability", "AggregateOffer"])
      assert.ok(!data.includes(`"${field}`), `${p.path}: ${field}`);
    assert.doesNotMatch(p.html.slice(p.html.indexOf("<app-root>")), /Desde \$/, p.path);
  }
});

test("un color sin foto propia no toma la de otro color en sus datos", () => {
  const petra = categories.flatMap((c) => c.types).find((t) => t.id === "cubrecama-petra")!;
  const cubrecamas = categories.find((c) => c.id === "cubrecamas")!;
  const group = node(page(catalogPath(cubrecamas.id, petra.id)), "ProductGroup");
  // Petra azul todavía no tiene foto: sus variantes van sin imagen; las blancas, con la suya.
  const azul = group.hasVariant.filter((v: Node) => v.color === "Azul");
  assert.ok(azul.length && azul.every((v: Node) => !("image" in v)));
  assert.ok(
    group.hasVariant
      .filter((v: Node) => v.color === "Blanco")
      .every((v: Node) => v.image.endsWith("producto-cubrecama-petra.webp")),
  );
  const natural = node(page(catalogPath("acolchados", "acolchado-pluma-natural")), "ProductGroup");
  assert.ok(natural.hasVariant.every((v: Node) => v.image?.endsWith("producto-acolchado-pluma-natural.webp")));
  assert.equal(natural.hasVariant[0].weight.unitCode, "GRM");
});

test("con SEO_OFFERS (catálogo real, B5) cada variante lleva su Offer en UYU", () => {
  const priced = prerenderPages(index, { ...site, offers: true }, categories);
  const html = priced.find((p) => p.path === satenPath)!.html;
  const variant = node(html, "ProductGroup").hasVariant[0];
  assert.equal(variant.offers["@type"], "Offer");
  assert.equal(variant.offers.priceCurrency, "UYU");
  assert.equal(variant.offers.price, saten.variants[0]!.price);
  assert.equal(variant.offers.itemCondition, "https://schema.org/NewCondition");
  assert.match(html, /<li>Twin \(160x240 cm\): \$/);
  assert.match(priced.find((p) => p.path === "/catalogo/sabanas/")!.html, /Desde \$/);
  assert.match(llmsTxt({ ...site, offers: true }, categories), /Desde \$/);
});

test("categoría: CollectionPage con la lista de sus productos y BreadcrumbList", () => {
  const html = page("/catalogo/sabanas/");
  assert.deepEqual(types(html), ["OnlineStore", "WebSite", "CollectionPage", "BreadcrumbList"]);
  const list = node(html, "CollectionPage").mainEntity;
  assert.deepEqual(
    list.itemListElement.map((i: Node) => i.url),
    sabanas!.types.map((t) => `https://piuma.uy${catalogPath("sabanas", t.id)}`),
  );
  assert.deepEqual(
    node(html, "BreadcrumbList").itemListElement.map((i: Node) => i.item),
    ["https://piuma.uy/", "https://piuma.uy/catalogo/sabanas/"],
  );
  assert.deepEqual(types(page("/")), ["OnlineStore", "WebSite", "WebPage"]);
});

test("JSON-LD no puede cerrar su <script>", () => {
  const [category] = categories;
  const types = [{ ...category!.types[0]!, fullName: "</script><b>" }];
  const html = prerenderPages(index, site, [{ ...category!, types }]).find(
    (p) => p.path === catalogPath(category!.id, types[0]!.id),
  )!.html;
  assert.ok(!html.includes("</script><b>"));
  assert.ok(html.includes("\\u003c/script>\\u003cb>"));
});

test("enlaces internos: menú de categorías y envíos en todas, hermanos en la ficha", () => {
  for (const p of pages) {
    for (const c of categories) assert.ok(p.html.includes(`<a href="${catalogPath(c.id)}">`), p.path);
    assert.ok(p.html.includes('<a href="/envios/">Envíos</a>'), p.path);
  }
  const html = page(satenPath);
  assert.ok(html.includes(`<a href="${catalogPath("sabanas", "sabanas-percal")}">`));
  assert.ok(html.includes('<a href="/envios/">Ver envíos</a>'));
});

test("robots.txt bloquea las vistas privadas y apunta al sitemap del dominio", () => {
  const robots = robotsTxt(site);
  for (const path of ["/cuenta", "/checkout", "/panel", "/pago"]) assert.ok(PRIVATE_PATHS.includes(path));
  for (const path of PRIVATE_PATHS) assert.ok(robots.includes(`\nDisallow: ${path}\n`), path);
  assert.ok(robots.startsWith("User-agent: *\nAllow: /\n"));
  assert.ok(robots.endsWith("\nSitemap: https://piuma.uy/sitemap.xml\n"));
});

test("sitemap.xml: sólo URLs indexables, con lastmod", () => {
  const xml = sitemapXml(site, categories, "2026-10-22");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, indexable.map((p) => `https://piuma.uy${p.path}`));
  assert.equal((xml.match(/<lastmod>2026-10-22<\/lastmod>/g) ?? []).length, locs.length);
  assert.ok(!xml.includes("404"));
});

test("404.html: noindex, sin canonical ni datos estructurados, con salida al catálogo", () => {
  const html = page(NOT_FOUND_PATH);
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.ok(!html.includes('<link rel="canonical"') && !html.includes('<link rel="alternate"'));
  assert.ok(!html.includes("application/ld+json"));
  assert.ok(html.includes("<title>Página no encontrada | Piuma</title>"));
  assert.ok(html.includes("<h1>No encontramos esta página</h1>"));
  for (const p of indexable) assert.ok(!p.html.includes('name="robots"'), p.path);
});

test("sin <base href> no se puede servir en subrutas", () => {
  assert.throws(() => prerenderPages(index.replace(/<base[^>]*>/, ""), site, categories), /base href/);
});

test("/envios/: política de Piuma, title con las zonas, FAQPage con las mismas preguntas (T68, T88)", () => {
  const html = page("/envios/");
  assert.ok(html.includes("<title>Envío gratis en zonas de Montevideo y Canelones | Piuma</title>"));
  assert.ok(html.includes('<link rel="canonical" href="https://piuma.uy/envios/">'));
  const description = meta(html, "name", "description")!;
  assert.match(description, /^Envío gratis en Carrasco, Pocitos/);
  for (const text of ["24 a 72 h", "Punta Carretas", "Parque Miramar", "Lo coordinamos por WhatsApp", "compras desde $\u00a03.000"])
    assert.ok(html.includes(text), text);
  for (const text of ["tipo DAC", "Tu dirección"]) assert.ok(!html.includes(text), text);
  assert.deepEqual(types(html), ["OnlineStore", "WebSite", "FAQPage", "BreadcrumbList"]);
  const faq = node(html, "FAQPage").mainEntity;
  assert.ok(faq.length >= 4);
  for (const q of faq) {
    assert.equal(q["@type"], "Question");
    assert.ok(html.includes(`<h2>${q.name}</h2>`), q.name);
    assert.ok(q.acceptedAnswer.text.length > 20);
  }
  assert.ok(faq.some((q: Node) => /Canelones: Parque Miramar y Ciudad de la Costa/.test(q.acceptedAnswer.text)));
  assert.ok(sitemapXml(site, categories, "2026-10-26").includes("<loc>https://piuma.uy/envios/</loc>"));
});

test("inicio: respuestas citables sobre qué vende, envíos, compra, pago y contacto (GEO)", () => {
  const html = page("/");
  for (const q of ["¿Hacen envíos? ¿Dónde es gratis?", "¿Cómo compro en Piuma?", "¿Cómo se paga?", "¿Cómo contacto a Piuma?"])
    assert.ok(html.includes(`<h3>${q}</h3>`), q);
  assert.ok(html.includes("Piuma es una tienda online de ropa de cama de Uruguay."));
  assert.ok(html.includes("+598 91 345 454") && html.includes("@piuma_uy"));
  assert.match(html, /nos escribís por WhatsApp/);
  const online = prerenderPages(index, { ...site, commerce: true }, categories)[0]!.html;
  assert.match(online, /Con transferencia bancaria o con tarjeta a través de Mercado Pago/);
});

test("llms.txt: marca, catálogo por categoría con enlaces, envíos y contacto, sin datos sensibles", () => {
  const text = llmsTxt(site, categories);
  assert.ok(text.startsWith("# Piuma\n\n> Piuma es una tienda online de ropa de cama de Uruguay."));
  for (const c of categories) {
    assert.ok(text.includes(`### [${c.name}](https://piuma.uy${catalogPath(c.id)})`), c.id);
    for (const t of c.types) assert.ok(text.includes(`- [${t.fullName}](https://piuma.uy${catalogPath(c.id, t.id)})`), t.id);
  }
  for (const s of ["https://piuma.uy/envios/", "+598 91 345 454", "@piuma_uy", "https://linktr.ee/piuma_uy", "Montevideo", "Canelones"])
    assert.ok(text.includes(s), s);
  for (const s of ["Valdivia", "distrifoto", "execute-api", "runtime-config", "/panel", "Desde $"])
    assert.ok(!text.includes(s), s);
});

/** Materiales y nombres que un alt no puede atribuir si el producto no los tiene. */
const MATERIALS = ["algodón", "lino", "poliéster", "microfibra", "pluma natural", "pluma sintética", "satén", "percal", "downproof"];

test("alt de las fotos: descriptivos y sin materiales que el producto no tiene (T88)", () => {
  for (const c of categories) {
    const own = (types: typeof c.types) =>
      types
        .map((t) => [t.fullName, t.name, t.material, t.description, ...(t.longDescription ?? []), ...(t.features ?? [])].join(" "))
        .join(" ")
        .toLowerCase();
    const check = (alt: string, about: string, where: string) => {
      assert.ok(alt.length >= 20, `${where}: alt corto "${alt}"`);
      for (const m of MATERIALS)
        if (alt.toLowerCase().includes(m)) assert.ok(about.includes(m), `${where}: "${m}" en "${alt}"`);
    };
    check(c.alt, own(c.types), c.id);
    for (const t of c.types) {
      check(t.alt, own([t]), t.id);
      for (const p of [...(t.gallery ?? []), ...Object.values(t.galleryByColor ?? {}).flat()])
        check(p.alt, own([t]), `${t.id} ${p.src}`);
    }
  }
});

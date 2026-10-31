import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SITE_CONFIG } from "../src/app/core/site-config.ts";
import type { Category } from "../src/app/models/catalog.model.ts";
import { PENDING, legalTexts, pendingParts } from "../src/app/core/legal.ts";
import {
  LEGAL_DRAFT,
  LEGAL_PAGES,
  type LegalId,
  legalIdFor,
  publishedLegalPages,
} from "../src/app/core/legal-pages.ts";
import { LEGAL_LINKS, SITE_ENV } from "../src/app/core/site-env.ts";
import { NOT_FOUND_PATH, llmsTxt, prerenderPages, siteLegalDocs, sitemapXml } from "../scripts/seo.ts";

const site = { ...SITE_CONFIG, url: "https://piuma.uy", legalPages: LEGAL_PAGES };
const categories: Category[] = JSON.parse(
  await readFile(new URL("../src/assets/data/catalog.json", import.meta.url), "utf8"),
);
const index = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
const pages = prerenderPages(index, site, categories);
const page = (path: string) => pages.find((p) => p.path === path)!.html;
const LEGAL_DOCS = siteLegalDocs(site);
const all = (id: LegalId) => legalTexts(LEGAL_DOCS.find((d) => d.id === id)!).join("\n");

test("rutas legales: con y sin barra final, y nada más", () => {
  assert.equal(legalIdFor("/privacidad/"), "privacidad");
  assert.equal(legalIdFor("/privacidad"), "privacidad");
  assert.equal(legalIdFor("/terminos/"), "terminos");
  assert.equal(legalIdFor("/cambios-y-devoluciones"), "cambios");
  for (const other of ["/", "/envios/", "/privacidad/x/", "/catalogo/privacidad/"])
    assert.equal(legalIdFor(other), null, other);
  assert.deepEqual(
    LEGAL_DOCS.map(({ id, path, label }) => ({ id, path, label })),
    LEGAL_PAGES,
  );
});

test("borrador: las marcas [A CONFIRMAR] impiden publicarlo como definitivo", () => {
  const pending = LEGAL_DOCS.flatMap((d) => legalTexts(d).flatMap((t) => t.match(PENDING) ?? []));
  if (LEGAL_DRAFT) assert.ok(pending.length > 0, "borrador sin nada a confirmar: ¿LEGAL_DRAFT = false?");
  else assert.deepEqual(pending, [], "quedan textos [A CONFIRMAR]");
});

test("pendingParts separa las marcas para resaltarlas", () => {
  assert.deepEqual(pendingParts("Plazo: [A CONFIRMAR: días]. Fin"), [
    { text: "Plazo: ", pending: false },
    { text: "[A CONFIRMAR: días]", pending: true },
    { text: ". Fin", pending: false },
  ]);
  assert.deepEqual(pendingParts("Sin marcas"), [{ text: "Sin marcas", pending: false }]);
});

test("privacidad: responsable, Ley 18.331, alojamiento, proveedores, derechos y analítica sin cookies", () => {
  const text = all("privacidad");
  for (const needed of [
    "Ley 18.331",
    "Distrifoto SRL",
    "213 376 180 018",
    "piumainfra@gmail.com",
    "+598 91 345 454",
    "us-east-2",
    "transferencia internacional",
    "Mercado Pago",
    "Google",
    "Amazon SES",
    "PostHog",
    "Unión Europea",
    "No vendemos",
    "sessionStorage",
    "rectificación",
    "supresión",
    "URCDP",
  ])
    assert.ok(text.includes(needed), needed);
});

test("términos y cambios: Ley 17.250, IVA, arrepentimiento de 5 días hábiles y lugar para la política propia", () => {
  const terms = all("terminos");
  for (const needed of ["Ley 17.250", "IVA", "5 días hábiles", "Mercado Pago", "Transferencia", "WhatsApp", "Garantía"])
    assert.ok(terms.includes(needed), needed);
  const returns = all("cambios");
  assert.ok(returns.includes("5 días hábiles"));
  assert.match(returns, /\[A CONFIRMAR: política propia de Piuma/);
});

test("cada página legal prerenderizada: meta propia, breadcrumb, enlazada desde el pie y en el sitemap", () => {
  const xml = sitemapXml(site, categories, "2026-10-30");
  for (const doc of LEGAL_DOCS) {
    const html = page(doc.path);
    assert.ok(html.includes(`<title>${doc.title} | Piuma</title>`), doc.path);
    assert.ok(html.includes(`<link rel="canonical" href="https://piuma.uy${doc.path}">`));
    assert.ok(html.includes(`<h1>${doc.title}</h1>`));
    assert.ok(doc.description.length <= 156, doc.description);
    assert.ok(!/name="robots"/.test(html), "indexable");
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1])["@graph"];
    const trail = graph.find((n: { "@type": string }) => n["@type"] === "BreadcrumbList");
    assert.deepEqual(trail.itemListElement[1], {
      "@type": "ListItem",
      position: 2,
      name: doc.title,
      item: `https://piuma.uy${doc.path}`,
    });
    assert.ok(xml.includes(`<loc>https://piuma.uy${doc.path}</loc>`));
    assert.ok(pages.every((p) => p.html.includes(`<a href="${doc.path}">${doc.label}</a>`)));
  }
});

test("borrador en prod: ninguna página legal publicada; en dev, o ya aprobado, todas (T99)", () => {
  assert.deepEqual(publishedLegalPages("prod", true), []);
  assert.deepEqual(publishedLegalPages("dev", true), LEGAL_PAGES);
  assert.deepEqual(publishedLegalPages("prod", false), LEGAL_PAGES);
  assert.deepEqual(publishedLegalPages("dev", false), LEGAL_PAGES);
  assert.deepEqual(publishedLegalPages("prod"), LEGAL_DRAFT ? [] : LEGAL_PAGES);
  // ng serve y node --test no definen PIUMA_SITE_ENV: dev, con las páginas para revisarlas.
  assert.equal(SITE_ENV, "dev");
  assert.deepEqual(LEGAL_LINKS, LEGAL_PAGES);
  // Una ruta legal no publicada no abre la página: queda la 404.
  assert.equal(legalIdFor("/privacidad/", []), null);
  assert.equal(legalIdFor("/terminos", publishedLegalPages("dev", true)), "terminos");
});

test("build de prod con el borrador: sin prerender, enlaces, sitemap ni llms.txt de las legales (T99)", () => {
  const prod = { ...site, legalPages: publishedLegalPages("prod", true) };
  const prodPages = prerenderPages(index, prod, categories);
  assert.equal(prodPages.length, pages.length - LEGAL_PAGES.length);
  assert.equal(prodPages.at(-1)!.path, NOT_FOUND_PATH);
  const xml = sitemapXml(prod, categories, "2026-10-30");
  const llms = llmsTxt(prod, categories);
  for (const p of LEGAL_PAGES) {
    assert.ok(!prodPages.some((page) => page.path === p.path), p.path);
    for (const page of prodPages) assert.ok(!page.html.includes(`href="${p.path}"`), `${page.path} enlaza ${p.path}`);
    assert.ok(!xml.includes(p.path), `sitemap con ${p.path}`);
    assert.ok(!llms.includes(p.path), `llms.txt con ${p.path}`);
  }
  assert.deepEqual(siteLegalDocs(prod), []);
  // Aprobado (LEGAL_DRAFT = false), prod publica lo mismo que dev.
  const approved = { ...site, legalPages: publishedLegalPages("prod", false) };
  assert.deepEqual(
    prerenderPages(index, approved, categories).map((p) => p.path),
    pages.map((p) => p.path),
  );
  for (const p of LEGAL_PAGES) assert.ok(llmsTxt(approved, categories).includes(`${site.url}${p.path}`));
});

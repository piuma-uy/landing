import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SITE_CONFIG } from "../src/app/core/site-config.ts";
import type { Category } from "../src/app/models/catalog.model.ts";
import { LEGAL_DRAFT, PENDING, legalTexts, pendingParts } from "../src/app/core/legal.ts";
import { LEGAL_PAGES, type LegalId, legalIdFor } from "../src/app/core/legal-pages.ts";
import { prerenderPages, siteLegalDocs, sitemapXml } from "../scripts/seo.ts";

const site = { ...SITE_CONFIG, url: "https://piuma.uy" };
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
    assert.deepEqual(graph[1].itemListElement[1], {
      "@type": "ListItem",
      position: 2,
      name: doc.title,
      item: `https://piuma.uy${doc.path}`,
    });
    assert.ok(xml.includes(`<loc>https://piuma.uy${doc.path}</loc>`));
    assert.ok(pages.every((p) => p.html.includes(`<a href="${doc.path}">${doc.label}</a>`)));
  }
});

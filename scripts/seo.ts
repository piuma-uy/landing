/**
 * Prerender del catálogo para SEO: funciones puras que usa scripts/prerender.ts después de `ng build`.
 *
 * La app sigue siendo un SPA sin SSR (el hosting es estático). Por cada URL pública del catálogo
 * (inicio, /catalogo/<categoría>/, /catalogo/<categoría>/<producto>/, /envios/ y las páginas legales
 * /privacidad/, /terminos/ y /cambios-y-devoluciones/) se escribe una copia del
 * index.html del build con:
 * - title, description, canonical y Open Graph propios de la página;
 * - datos estructurados JSON-LD (Store, Product con AggregateOffer, ItemList, BreadcrumbList);
 * - el contenido como HTML semántico dentro de <app-root>, para crawlers que no ejecutan JavaScript.
 *   Se oculta con CSS y sólo se muestra en <noscript>: con JavaScript Angular lo reemplaza al arrancar
 *   y así no hay salto de layout. Nada de scripts inline nuevos (CSP script-src 'self').
 * Y además robots.txt y sitemap.xml: sin ellos el rewrite a index.html del hosting sirve HTML en
 * /robots.txt y Lighthouse lo marca inválido.
 */
import type { Category, ProductType } from "../src/app/models/catalog.model.ts";
import { catalogPath, pageMeta, type PageMeta } from "../src/app/core/catalog-seo.ts";
import { formatWhatsapp, generalMessage, normalizeWhatsapp, waLink } from "../src/app/core/whatsapp.ts";
import {
  FALLBACK_POLICY,
  SHIPPING_PATH,
  policyDescription,
  policySections,
} from "../src/app/core/shipping-policy.ts";
import { type LegalDoc, legalDocs } from "../src/app/core/legal.ts";
import { LEGAL_PAGES } from "../src/app/core/legal-pages.ts";

export interface Site {
  /** Origen público sin barra final, ej. https://piuma.uy */
  url: string;
  brandName: string;
  tagline: string;
  whatsappNumber: string;
  email: string;
  instagramUrl: string;
  city: string;
}

export interface Page extends PageMeta {
  html: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const absolute = (site: Site, path: string) =>
  /^https?:\/\//.test(path) ? path : `${site.url}/${path.replace(/^\//, "")}`;

const prices = (type: ProductType) => type.variants.map((v) => v.price);

/** Mismo formato que CatalogComponent.formatPriceFrom. */
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);

const unique = (values: string[]) => [...new Set(values)];

const whatsappLink = (site: Site, about?: string) =>
  waLink(
    site.whatsappNumber,
    about
      ? `¡Hola ${site.brandName}! Quiero consultar sobre ${about}.`
      : generalMessage(site.brandName),
  );

// ---------------------------------------------------------------- HTML de <app-root>

function productCard(type: ProductType, category: Category): string {
  return (
    `<li><a href="${catalogPath(category.id, type.id)}">${escapeHtml(type.fullName)}</a>` +
    ` — ${escapeHtml(type.description)} Desde ${escapeHtml(money(Math.min(...prices(type)), type.currency))}.</li>`
  );
}

function productDetail(site: Site, type: ProductType): string {
  const colors = unique(type.variants.flatMap((v) => v.colors)).join(", ");
  return [
    `<img src="${escapeHtml(type.image)}" alt="${escapeHtml(type.alt)}" loading="lazy" width="800" height="1000">`,
    `<p>${escapeHtml(type.description)}</p>`,
    ...(type.longDescription ?? []).map((p) => `<p>${escapeHtml(p)}</p>`),
    type.features?.length
      ? `<ul>${type.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`
      : "",
    type.material ? `<p>Material: ${escapeHtml(type.material)}</p>` : "",
    `<h2>Medidas y precios</h2><ul>`,
    ...type.variants.map(
      (v) =>
        `<li>${escapeHtml(v.size)} (${escapeHtml(v.productSize)}): ${escapeHtml(money(v.price, type.currency))}</li>`,
    ),
    `</ul>`,
    colors ? `<p>Colores: ${escapeHtml(colors)}</p>` : "",
    `<p><a href="${escapeHtml(whatsappLink(site, type.fullName))}">Consultar por WhatsApp</a></p>`,
  ].join("");
}

/** /envios/: la política estática de Piuma (sin API en el build). */
function shippingBody(): string {
  return (
    `<nav aria-label="Ruta"><a href="/">Inicio</a></nav>` +
    `<h1>Cómo te llega tu pedido</h1>` +
    policySections(FALLBACK_POLICY)
      .map(
        (s) =>
          `<h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.text)}</p>` +
          (s.items?.length ? `<ul>${s.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : ""),
      )
      .join("")
  );
}

/** Privacidad, términos o cambios (T89): el mismo texto que LegalPageComponent. */
function legalBody(doc: LegalDoc): string {
  const paragraphs = (texts: string[]) => texts.map((t) => `<p>${escapeHtml(t)}</p>`).join("");
  return (
    `<nav aria-label="Ruta"><a href="/">Inicio</a></nav>` +
    `<h1>${escapeHtml(doc.title)}</h1>` +
    `<p>Última actualización: ${escapeHtml(doc.updated)}</p>` +
    doc.sections
      .map(
        (s) =>
          `<h2>${escapeHtml(s.title)}</h2>${paragraphs(s.paragraphs)}` +
          (s.items?.length ? `<ul>${s.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : ""),
      )
      .join("")
  );
}

/** Privacidad, términos y cambios con el WhatsApp de la tienda. */
export const siteLegalDocs = (site: Site) => legalDocs(LEGAL_PAGES, formatWhatsapp(site.whatsappNumber));

/** Una página informativa en vez del catálogo: /envios/ o una legal. */
type InfoPage = "shipping" | LegalDoc;

function body(
  site: Site,
  categories: Category[],
  category: Category | null,
  type: ProductType | null,
  info: InfoPage | null = null,
): string {
  let main: string;
  if (info === "shipping") main = shippingBody();
  else if (info) main = legalBody(info);
  else if (category && type) {
    main =
      `<nav aria-label="Ruta"><a href="/">Inicio</a> › <a href="${catalogPath(category.id)}">${escapeHtml(category.name)}</a></nav>` +
      `<h1>${escapeHtml(type.fullName)}</h1>${productDetail(site, type)}`;
  } else if (category) {
    main =
      `<nav aria-label="Ruta"><a href="/">Inicio</a></nav>` +
      `<h1>${escapeHtml(category.name)}</h1>` +
      `<ul>${category.types.map((t) => productCard(t, category)).join("")}</ul>`;
  } else {
    main =
      `<h1>${escapeHtml(site.brandName)} — ${escapeHtml(site.tagline)}</h1>` +
      `<section id="catalogo"><h2>Nuestra colección</h2>` +
      categories
        .map(
          (c) =>
            `<h3><a href="${catalogPath(c.id)}">${escapeHtml(c.name)}</a></h3>` +
            `<ul>${c.types.map((t) => productCard(t, c)).join("")}</ul>`,
        )
        .join("") +
      `</section>`;
  }
  return (
    `<div class="prerender">` +
    `<header><p><a href="/">${escapeHtml(site.brandName)}</a></p></header>` +
    `<main>${main}</main>` +
    `<footer><p><a href="${SHIPPING_PATH}">Envíos</a>` +
    LEGAL_PAGES.map((p) => ` · <a href="${p.path}">${escapeHtml(p.label)}</a>`).join("") +
    ` · <a href="${escapeHtml(whatsappLink(site))}">WhatsApp</a>` +
    ` · <a href="mailto:${escapeHtml(site.email)}">${escapeHtml(site.email)}</a>` +
    ` · <a href="${escapeHtml(site.instagramUrl)}">Instagram</a> · ${escapeHtml(site.city)}</p></footer>` +
    `</div>`
  );
}

// ---------------------------------------------------------------- JSON-LD

function product(site: Site, category: Category, type: ProductType) {
  return {
    "@type": "Product",
    "@id": `${site.url}${catalogPath(category.id, type.id)}#product`,
    url: `${site.url}${catalogPath(category.id, type.id)}`,
    name: type.fullName,
    description: [type.description, ...(type.longDescription ?? [])].join(" "),
    image: unique([
      type.image,
      ...Object.values(type.colorImages ?? {}),
      ...(type.gallery ?? []).map((p) => p.src),
    ]).map((src) => absolute(site, src)),
    category: category.name,
    ...(type.material ? { material: type.material } : {}),
    brand: { "@type": "Brand", name: site.brandName },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: type.currency,
      lowPrice: Math.min(...prices(type)),
      highPrice: Math.max(...prices(type)),
      offerCount: type.variants.length,
      seller: { "@id": `${site.url}/#store` },
    },
  };
}

function breadcrumbs(site: Site, category: Category, type: ProductType | null) {
  const items = [
    { name: "Inicio", path: "/" },
    { name: category.name, path: catalogPath(category.id) },
    ...(type ? [{ name: type.fullName, path: catalogPath(category.id, type.id) }] : []),
  ];
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${site.url}${item.path}`,
    })),
  };
}

const itemList = (site: Site, name: string, entries: [Category, ProductType][]) => ({
  "@type": "ItemList",
  name,
  itemListElement: entries.map(([c, t], i) => ({
    "@type": "ListItem",
    position: i + 1,
    item: product(site, c, t),
  })),
});

export function structuredData(
  site: Site,
  categories: Category[],
  category: Category | null = null,
  type: ProductType | null = null,
) {
  const store = {
    "@type": "Store",
    "@id": `${site.url}/#store`,
    name: site.brandName,
    description: site.tagline,
    url: `${site.url}/`,
    image: absolute(site, "assets/images/hero-piuma.webp"),
    logo: absolute(site, "assets/images/logo/logo-piuma-terracota.webp"),
    telephone: normalizeWhatsapp(site.whatsappNumber),
    email: site.email,
    address: {
      "@type": "PostalAddress",
      addressLocality: site.city.split(",").slice(0, -1).join(",").trim(),
      addressCountry: "UY",
    },
    sameAs: [site.instagramUrl],
  };
  let page: object[];
  if (category && type) page = [product(site, category, type), breadcrumbs(site, category, type)];
  else if (category)
    page = [
      itemList(site, category.name, category.types.map((t) => [category, t])),
      breadcrumbs(site, category, null),
    ];
  else
    page = [
      {
        "@type": "WebSite",
        "@id": `${site.url}/#website`,
        name: site.brandName,
        url: `${site.url}/`,
        inLanguage: "es-UY",
        publisher: { "@id": store["@id"] },
      },
      itemList(
        site,
        `Catálogo ${site.brandName}`,
        categories.flatMap((c) => c.types.map((t): [Category, ProductType] => [c, t])),
      ),
    ];
  return { "@context": "https://schema.org", "@graph": [store, ...page] };
}

// ---------------------------------------------------------------- páginas

/** JSON dentro de <script>: `<` escapado para que ningún texto pueda cerrar la etiqueta. */
const jsonForScript = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

function replace(html: string, pattern: RegExp, by: (...groups: string[]) => string): string {
  if (!pattern.test(html)) throw new Error(`prerender: index.html sin ${pattern}`);
  return html.replace(pattern, by);
}

function render(
  html: string,
  site: Site,
  categories: Category[],
  category: Category | null,
  type: ProductType | null,
  info: InfoPage | null = null,
): Page {
  const meta =
    info === "shipping"
      ? shippingMeta(site)
      : info
        ? legalMeta(site, info)
        : pageMeta(site.brandName, category, type);
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const head = [
    `<link rel="canonical" href="${site.url}${meta.path}">`,
    `<meta property="og:url" content="${site.url}${meta.path}">`,
    `<meta property="og:site_name" content="${escapeHtml(site.brandName)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<script type="application/ld+json">${jsonForScript(
      info ? infoData(site, info === "shipping" ? "Envíos" : info.title, meta.path) : structuredData(site, categories, category, type),
    )}</script>`,
    `<style>.prerender{display:none}</style>`,
    `<noscript><style>.prerender{display:block;padding:1rem}</style></noscript>`,
  ].join("\n    ");
  let out = replace(html, /<title>[^<]*<\/title>/, () => `<title>${title}</title>`);
  out = replace(out, /(<meta\s+name="description"\s+content=")[^"]*/, (_, a) => a + description);
  out = replace(out, /(<meta property="og:title" content=")[^"]*/, (_, a) => a + title);
  out = replace(out, /(<meta\s+property="og:description"\s+content=")[^"]*/, (_, a) => a + description);
  out = replace(out, /(<meta property="og:image" content=")([^"]+)/, (_, a, src) =>
    a + escapeHtml(absolute(site, type?.image ?? src)),
  );
  out = replace(out, /<\/head>/, () => `  ${head}\n  </head>`);
  out = replace(out, /<app-root><\/app-root>/, () =>
    `<app-root>${body(site, categories, category, type, info)}</app-root>`,
  );
  return { ...meta, html: out };
}

const shippingMeta = (site: Site): PageMeta => ({
  path: SHIPPING_PATH,
  title: `Envíos y entregas | ${site.brandName}`,
  description: policyDescription(FALLBACK_POLICY),
});

const legalMeta = (site: Site, doc: LegalDoc): PageMeta => ({
  path: doc.path,
  title: `${doc.title} | ${site.brandName}`,
  description: doc.description,
});

/** Store y BreadcrumbList; la política en sí va como texto. */
function infoData(site: Site, name: string, path: string) {
  const [store] = structuredData(site, [])["@graph"];
  return {
    "@context": "https://schema.org",
    "@graph": [
      store,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: `${site.url}/` },
          { "@type": "ListItem", position: 2, name, item: `${site.url}${path}` },
        ],
      },
    ],
  };
}

/** Todas las páginas públicas: catálogo, /envios/ y legales, a partir del index.html que deja `ng build`. */
export function prerenderPages(html: string, site: Site, categories: Category[]): Page[] {
  if (!/<base href="\/"\s*\/?>/.test(html))
    throw new Error('prerender: index.html necesita <base href="/"> para servirse en subrutas');
  return [
    render(html, site, categories, null, null),
    render(html, site, categories, null, null, "shipping"),
    ...siteLegalDocs(site).map((d) => render(html, site, categories, null, null, d)),
    ...categories.flatMap((c) => [
      render(html, site, categories, c, null),
      ...c.types.map((t) => render(html, site, categories, c, t)),
    ]),
  ];
}

export function robotsTxt(site: Site): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`;
}

export function sitemapXml(site: Site, categories: Category[], lastmod: string): string {
  const entry = (path: string, images: string[]) =>
    [
      `  <url>`,
      `    <loc>${site.url}${path}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      ...unique(images).map(
        (src) => `    <image:image><image:loc>${escapeHtml(absolute(site, src))}</image:loc></image:image>`,
      ),
      `  </url>`,
    ].join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
    entry("/", ["assets/images/hero-piuma.webp"]),
    entry(SHIPPING_PATH, []),
    ...LEGAL_PAGES.map((p) => entry(p.path, [])),
    ...categories.flatMap((c) => [
      entry(catalogPath(c.id), [c.image]),
      ...c.types.map((t) =>
        entry(catalogPath(c.id, t.id), [t.image, ...Object.values(t.colorImages ?? {})]),
      ),
    ]),
    `</urlset>`,
    ``,
  ].join("\n");
}

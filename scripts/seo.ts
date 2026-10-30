/**
 * Prerender del catálogo para SEO: funciones puras que usa scripts/prerender.ts después de `ng build`.
 *
 * La app sigue siendo un SPA sin SSR (el hosting es estático). Por cada URL pública del catálogo
 * (inicio, /envios/, las páginas legales de T89, /catalogo/<categoría>/ y
 * /catalogo/<categoría>/<producto>/) se escribe una copia del index.html del build con:
 * - title, description, canonical, hreflang, Open Graph y Twitter propios de la página, con una
 *   imagen de 1200x630 por página (scripts/og-images.py);
 * - datos estructurados JSON-LD (OnlineStore, WebSite, la página, ProductGroup con sus variantes,
 *   ItemList, BreadcrumbList y FAQPage en /envios/);
 * - el contenido como HTML semántico dentro de <app-root>, para crawlers y motores de IA que no
 *   ejecutan JavaScript. Se oculta con CSS y sólo se muestra en <noscript>: con JavaScript Angular lo
 *   reemplaza al arrancar y así no hay salto de layout. Nada de scripts inline nuevos (CSP script-src
 *   'self'; el JSON-LD es un bloque de datos y la CSP no lo ejecuta).
 * Además 404.html (noindex, la sirve CloudFront con estado 404), robots.txt, sitemap.xml y llms.txt.
 * Sin ellos el rewrite a index.html del hosting serviría HTML en esas rutas.
 *
 * Precios y disponibilidad: el catálogo del JSON todavía es de demo, así que no van ni en el JSON-LD
 * ni en el texto (Google los compara con la página y los motores de IA los repiten). Con el catálogo
 * real cargado (B5), SEO_OFFERS=1 en el build los agrega como Offer en cada variante.
 */
import type { Category, ProductType, Variant } from "../src/app/models/catalog.model.ts";
import {
  catalogPath,
  categoryLead,
  pageMeta,
  withBrand,
  type PageMeta,
} from "../src/app/core/catalog-seo.ts";
import { formatWhatsapp, generalMessage, normalizeWhatsapp, waLink } from "../src/app/core/whatsapp.ts";
import {
  FALLBACK_POLICY,
  SHIPPING_PATH,
  freeShippingLine,
  list,
  policyDescription,
  policySections,
  policyTitle,
} from "../src/app/core/shipping-policy.ts";
import { sortSizes } from "../src/app/core/sizes.ts";
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
  /** Vacío mientras no esté confirmado: no va en sameAs. */
  linktreeUrl: string;
  city: string;
  /** SEO_OFFERS=1: precios reales (B5), con Offer en el JSON-LD y precio en el texto. */
  offers?: boolean;
  /** SITE_COMMERCE=1: la tienda vende online (commerceEnabled en prod); cambia "cómo comprar". */
  commerce?: boolean;
}

export interface Page extends PageMeta {
  html: string;
}

export const LANGUAGE = "es-UY";
export const NOT_FOUND_PATH = "/404.html";
/** Rutas que no son contenido: robots.txt las bloquea (y las vistas privadas llevan noindex). */
export const PRIVATE_PATHS = ["/cuenta", "/checkout", "/panel", "/pago", "/auth"];

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const absolute = (site: Site, path: string) =>
  /^https?:\/\//.test(path) ? path : `${site.url}/${path.replace(/^\//, "")}`;

/** Mismo formato que CatalogComponent.formatPriceFrom. */
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);

const unique = (values: string[]) => [...new Set(values)];
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

const whatsappLink = (site: Site, about?: string) =>
  waLink(
    site.whatsappNumber,
    about
      ? `¡Hola ${site.brandName}! Quiero consultar sobre ${about}.`
      : generalMessage(site.brandName),
  );

const instagramHandle = (site: Site) => "@" + site.instagramUrl.replace(/\/+$/, "").split("/").pop();

// ---------------------------------------------------------------- imágenes para compartir

export interface ShareImage {
  path: string;
  alt: string;
}

/** La imagen de 1200x630 de cada página (scripts/og-images.py), por nombre. */
export function shareImage(category: Category | null, type: ProductType | null, shipping = false): ShareImage {
  if (shipping)
    return { path: "assets/images/og/envios.jpg", alt: "Bolsa de Piuma con un acolchado sobre una cama" };
  if (category && type) return { path: `assets/images/og/${type.id}.jpg`, alt: type.alt };
  if (category) return { path: `assets/images/og/categoria-${category.id}.jpg`, alt: category.alt };
  return {
    path: "assets/images/og/inicio.jpg",
    alt: "Cama tendida con un acolchado de pluma natural blanco de Piuma",
  };
}

// ---------------------------------------------------------------- respuestas citables (GEO)

export interface Answer {
  question: string;
  answer: string;
}

/** "Montevideo: Carrasco y Pocitos" → "Montevideo (Carrasco y Pocitos)". */
const area = (text: string) => text.replace(/^([^:]+):\s*(.+)$/, "$1 ($2)");

/** "Twin (160x230 cm)"; "50x70 cm" cuando la medida ya es el tamaño. */
const sizeLabel = (v: Variant) =>
  v.productSize.startsWith(v.size) ? v.productSize : `${v.size} (${v.productSize})`;

/** Envíos en una frase: plazo, zonas gratis, monto y el resto a coordinar. */
function shippingAnswer(): string {
  const p = FALLBACK_POLICY;
  return [
    p.freeAreas.length ? `Envío gratis en estas zonas: ${list(p.freeAreas.map(area))}.` : "",
    p.freeFrom ? `También es gratis en compras desde ${p.freeFrom}.` : "",
    p.coordinate ? "Al resto de Montevideo y al interior lo coordinamos por WhatsApp." : "",
    p.leadTime ? `El pedido llega en ${p.leadTime} desde que se confirma el pago.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Qué vende, envíos, cómo comprar y pagar, y contacto: en el inicio y en llms.txt. */
export function brandAnswers(site: Site, categories: Category[]): Answer[] {
  const whatsapp = formatWhatsapp(site.whatsappNumber);
  return [
    {
      question: `¿Qué vende ${site.brandName}?`,
      // Resumen del catálogo actual (catalog.json); revisarlo cuando se cargue el real (B5).
      answer:
        `${site.brandName} es una tienda online de ropa de cama de Uruguay. Vende juegos de sábanas ` +
        `100% algodón (percal y satén), acolchados de pluma natural y sintética, rellenos nórdicos, ` +
        `fundas nórdicas de algodón y de lino, cubrecamas de algodón y almohadas de pluma natural.`,
    },
    { question: "¿Hacen envíos? ¿Dónde es gratis?", answer: shippingAnswer() },
    {
      question: `¿Cómo compro en ${site.brandName}?`,
      answer: site.commerce
        ? `En ${site.url.replace(/^https?:\/\//, "")}: elegís el producto, la medida y el color, ` +
          `lo agregás al carrito y confirmás la compra con tu cuenta. Después te escribimos por ` +
          `WhatsApp para coordinar la entrega.`
        : `Elegís el producto, la medida y el color en el catálogo y nos escribís por WhatsApp al ` +
          `${whatsapp}: te confirmamos stock, precio y entrega.`,
    },
    {
      question: "¿Cómo se paga?",
      answer: site.commerce
        ? "Con transferencia bancaria o con tarjeta a través de Mercado Pago, al confirmar la compra."
        : `El pago se coordina por WhatsApp al confirmar el pedido. La compra online, con ` +
          `transferencia bancaria o tarjeta a través de Mercado Pago, se habilita en la tienda.`,
    },
    {
      question: `¿Cómo contacto a ${site.brandName}?`,
      answer: `Por WhatsApp al ${whatsapp} o por Instagram, ${instagramHandle(site)}.`,
    },
  ];
}

/** Las secciones de /envios/ como preguntas: el texto visible y el FAQPage dicen lo mismo. */
const SHIPPING_QUESTIONS: Record<string, string> = {
  "Cuánto tarda": "¿Cuánto tarda en llegar mi pedido?",
  "Envío gratis": "¿En qué zonas el envío es gratis?",
  "Con costo de envío": "¿Qué zonas tienen costo de envío?",
  "Resto de Montevideo e interior": "¿Envían al resto de Montevideo y al interior?",
  "Compras grandes": "¿Hay envío gratis según el monto de la compra?",
  Retiro: "¿Puedo retirar el pedido?",
  "Cómo sigue": "¿Cómo se coordina la entrega?",
};

export function shippingAnswers(): (Answer & { text: string; items?: string[] })[] {
  return policySections(FALLBACK_POLICY).map((s) => ({
    question: SHIPPING_QUESTIONS[s.title] ?? s.title,
    answer: s.items?.length ? `${s.text} ${s.items.join("; ")}.` : s.text,
    text: s.text,
    items: s.items,
  }));
}

// ---------------------------------------------------------------- HTML de <app-root>

const priceFrom = (type: ProductType) =>
  money(Math.min(...type.variants.map((v) => v.price)), type.currency);

function productCard(site: Site, type: ProductType, category: Category): string {
  return (
    `<li><a href="${catalogPath(category.id, type.id)}">${escapeHtml(type.fullName)}</a>` +
    (type.material ? ` (${escapeHtml(type.material)})` : "") +
    ` — ${escapeHtml(type.description)}` +
    (site.offers ? ` Desde ${escapeHtml(priceFrom(type))}.` : "") +
    `</li>`
  );
}

function productDetail(site: Site, category: Category, type: ProductType): string {
  const colors = unique(type.variants.flatMap((v) => v.colors)).join(", ");
  const siblings = category.types.filter((t) => t.id !== type.id);
  return [
    `<img src="${escapeHtml(type.image)}" alt="${escapeHtml(type.alt)}" loading="lazy" width="800" height="1000">`,
    `<p>${escapeHtml(type.description)}</p>`,
    ...(type.longDescription ?? []).map((p) => `<p>${escapeHtml(p)}</p>`),
    type.features?.length
      ? `<ul>${type.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`
      : "",
    type.material ? `<p>Material: ${escapeHtml(type.material)}</p>` : "",
    type.includes ? `<p>${escapeHtml(type.includes)}.</p>` : "",
    `<h2>Medidas</h2><ul>`,
    ...type.variants.map(
      (v) =>
        `<li>${escapeHtml(sizeLabel(v))}` +
        (site.offers ? `: ${escapeHtml(money(v.price, type.currency))}` : "") +
        `</li>`,
    ),
    `</ul>`,
    colors ? `<p>Colores: ${escapeHtml(colors)}</p>` : "",
    `<p>${escapeHtml(freeShippingLine(FALLBACK_POLICY))} <a href="${SHIPPING_PATH}">Ver envíos</a></p>`,
    `<p><a href="${escapeHtml(whatsappLink(site, type.fullName))}">Consultar por WhatsApp</a></p>`,
    siblings.length
      ? `<h2>Más ${escapeHtml(lower(category.name))}</h2><ul>${siblings
          .map((t) => `<li><a href="${catalogPath(category.id, t.id)}">${escapeHtml(t.fullName)}</a></li>`)
          .join("")}</ul>`
      : "",
  ].join("");
}

const crumbs = (items: { name: string; path: string }[]) =>
  `<nav aria-label="Ruta">` +
  items.map((i) => `<a href="${i.path}">${escapeHtml(i.name)}</a>`).join(" › ") +
  `</nav>`;

/** /envios/: la política estática de Piuma (sin API en el build), cada sección como pregunta. */
function shippingBody(): string {
  return (
    crumbs([{ name: "Inicio", path: "/" }]) +
    `<h1>Cómo te llega tu pedido</h1>` +
    `<p>${escapeHtml(policyDescription(FALLBACK_POLICY))}</p>` +
    shippingAnswers()
      .map(
        (a) =>
          `<h2>${escapeHtml(a.question)}</h2>` +
          `<p>${escapeHtml(a.text)}</p>` +
          (a.items?.length ? `<ul>${a.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : ""),
      )
      .join("")
  );
}

function otherCategories(categories: Category[], current: Category | null): string {
  const others = categories.filter((c) => c !== current);
  return (
    `<h2>${current ? "Otras categorías" : "Categorías"}</h2><ul>` +
    others.map((c) => `<li><a href="${catalogPath(c.id)}">${escapeHtml(c.name)}</a></li>`).join("") +
    `</ul>`
  );
}

function notFoundBody(site: Site, categories: Category[]): string {
  return (
    `<h1>No encontramos esta página</h1>` +
    `<p>Puede que el enlace esté mal escrito o que el producto ya no esté en el catálogo. ` +
    `Mirá la colección o escribinos por WhatsApp.</p>` +
    otherCategories(categories, null) +
    `<p><a href="/">Ir al inicio</a> · <a href="${SHIPPING_PATH}">Envíos</a> · ` +
    `<a href="${escapeHtml(whatsappLink(site))}">WhatsApp</a></p>`
  );
}

/** Privacidad, términos o cambios (T89): el mismo texto que LegalPageComponent. */
function legalBody(doc: LegalDoc): string {
  const paragraphs = (texts: string[]) => texts.map((t) => `<p>${escapeHtml(t)}</p>`).join("");
  return (
    crumbs([{ name: "Inicio", path: "/" }]) +
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

type Kind = "home" | "category" | "product" | "shipping" | "legal" | "notFound";

function body(
  site: Site,
  categories: Category[],
  kind: Kind,
  category: Category | null,
  type: ProductType | null,
  doc: LegalDoc | null = null,
): string {
  let main: string;
  if (kind === "shipping") main = shippingBody();
  else if (doc) main = legalBody(doc);
  else if (kind === "notFound") main = notFoundBody(site, categories);
  else if (category && type) {
    main =
      crumbs([
        { name: "Inicio", path: "/" },
        { name: category.name, path: catalogPath(category.id) },
      ]) +
      `<h1>${escapeHtml(type.fullName)}</h1>${productDetail(site, category, type)}` +
      otherCategories(categories, category);
  } else if (category) {
    main =
      crumbs([{ name: "Inicio", path: "/" }]) +
      `<h1>${escapeHtml(category.name)}</h1>` +
      `<p>${escapeHtml(categoryLead(category, site.brandName))}</p>` +
      `<ul>${category.types.map((t) => productCard(site, t, category)).join("")}</ul>` +
      `<p>${escapeHtml(freeShippingLine(FALLBACK_POLICY))} <a href="${SHIPPING_PATH}">Ver envíos</a></p>` +
      otherCategories(categories, category);
  } else {
    const [about, ...faq] = brandAnswers(site, categories);
    main =
      `<h1>${escapeHtml(site.brandName)}: ropa de cama en Uruguay</h1>` +
      `<p>${escapeHtml(about!.answer)}</p>` +
      `<section id="catalogo"><h2>Nuestra colección</h2>` +
      categories
        .map(
          (c) =>
            `<h3><a href="${catalogPath(c.id)}">${escapeHtml(c.name)}</a></h3>` +
            `<ul>${c.types.map((t) => productCard(site, t, c)).join("")}</ul>`,
        )
        .join("") +
      `</section>` +
      `<section id="preguntas"><h2>Preguntas frecuentes</h2>` +
      faq.map((a) => `<h3>${escapeHtml(a.question)}</h3><p>${escapeHtml(a.answer)}</p>`).join("") +
      `</section>`;
  }
  return (
    `<div class="prerender">` +
    `<header><p><a href="/">${escapeHtml(site.brandName)}</a></p>` +
    `<nav aria-label="Catálogo"><ul>` +
    categories.map((c) => `<li><a href="${catalogPath(c.id)}">${escapeHtml(c.name)}</a></li>`).join("") +
    `<li><a href="${SHIPPING_PATH}">Envíos</a></li></ul></nav></header>` +
    `<main>${main}</main>` +
    `<footer><p><a href="${SHIPPING_PATH}">Envíos</a>` +
    LEGAL_PAGES.map((p) => ` · <a href="${p.path}">${escapeHtml(p.label)}</a>`).join("") +
    ` · <a href="${escapeHtml(whatsappLink(site))}">WhatsApp ${escapeHtml(formatWhatsapp(site.whatsappNumber))}</a>` +
    ` · <a href="${escapeHtml(site.instagramUrl)}">Instagram ${escapeHtml(instagramHandle(site))}</a>` +
    ` · <a href="mailto:${escapeHtml(site.email)}">${escapeHtml(site.email)}</a>` +
    ` · ${escapeHtml(site.city)}</p></footer>` +
    `</div>`
  );
}

// ---------------------------------------------------------------- JSON-LD

const id = (site: Site, path: string, fragment: string) => `${site.url}${path}#${fragment}`;

/**
 * Piuma como OnlineStore: vende online, sin local al público. No lleva dirección (la de Valdivia es
 * fiscal, no de atención) ni horarios; areaServed es Uruguay y los departamentos con envío gratis.
 */
export function organization(site: Site) {
  const whatsapp = normalizeWhatsapp(site.whatsappNumber);
  return {
    "@type": "OnlineStore",
    "@id": id(site, "/", "organization"),
    name: site.brandName,
    description: `Tienda online de ropa de cama de Uruguay. ${site.tagline}.`,
    url: `${site.url}/`,
    logo: {
      "@type": "ImageObject",
      "@id": id(site, "/", "logo"),
      url: absolute(site, "assets/images/logo/logo-piuma-terracota.webp"),
      width: 600,
      height: 316,
      caption: site.brandName,
    },
    image: absolute(site, "assets/images/og/inicio.jpg"),
    email: site.email,
    telephone: whatsapp,
    sameAs: [site.instagramUrl, site.linktreeUrl].filter(Boolean),
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      telephone: whatsapp,
      url: whatsappLink(site),
      availableLanguage: "es",
      areaServed: "UY",
    },
    areaServed: [
      { "@type": "Country", name: "Uruguay" },
      ...FALLBACK_POLICY.freeAreas
        .filter((a) => a.includes(":"))
        .map((a) => ({
          "@type": "AdministrativeArea",
          name: a.slice(0, a.indexOf(":")),
          containedInPlace: { "@type": "Country", name: "Uruguay" },
        })),
    ],
    knowsLanguage: LANGUAGE,
  };
}

const website = (site: Site) => ({
  "@type": "WebSite",
  "@id": id(site, "/", "website"),
  name: site.brandName,
  url: `${site.url}/`,
  inLanguage: LANGUAGE,
  publisher: { "@id": id(site, "/", "organization") },
});

function webPage(site: Site, type: string, meta: PageMeta, image: ShareImage, extra: object = {}) {
  return {
    "@type": type,
    "@id": `${site.url}${meta.path}`,
    url: `${site.url}${meta.path}`,
    name: meta.title,
    description: meta.description,
    inLanguage: LANGUAGE,
    isPartOf: { "@id": id(site, "/", "website") },
    primaryImageOfPage: absolute(site, image.path),
    ...extra,
  };
}

const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Una variante por medida y color. La foto sólo si es la de ese color (nunca la de otro). */
function variant(site: Site, category: Category, type: ProductType, v: Variant, color: string) {
  const url = `${site.url}${catalogPath(category.id, type.id)}`;
  const single = unique(type.variants.flatMap((x) => x.colors)).length === 1;
  const image = type.colorImages?.[color] ?? (single ? type.image : null);
  const sku = v.skuByColor?.[color];
  const stock = v.stockByColor?.[color];
  const price = v.priceByColor?.[color] ?? v.price;
  return {
    "@type": "Product",
    "@id": `${url}#${slug(`${v.size}-${color}`)}`,
    name: `${type.fullName} ${v.size} ${lower(color)}`,
    size: `${v.size} (${v.productSize})`,
    color,
    ...(image ? { image: absolute(site, image) } : {}),
    ...(sku ? { sku } : {}),
    ...(v.weightGrams ? { weight: { "@type": "QuantitativeValue", value: v.weightGrams, unitCode: "GRM" } } : {}),
    ...(site.offers
      ? {
          offers: {
            "@type": "Offer",
            url,
            price,
            priceCurrency: type.currency,
            itemCondition: "https://schema.org/NewCondition",
            ...(stock === undefined
              ? {}
              : { availability: `https://schema.org/${stock > 0 ? "InStock" : "OutOfStock"}` }),
            seller: { "@id": id(site, "/", "organization") },
          },
        }
      : {}),
  };
}

/** El producto con sus medidas y colores (ProductGroup), sin precio mientras el catálogo sea demo. */
export function productGroup(site: Site, category: Category, type: ProductType) {
  const path = catalogPath(category.id, type.id);
  const variants = sortSizes(type.variants);
  const colors = unique(variants.flatMap((v) => v.colors));
  return {
    "@type": "ProductGroup",
    "@id": `${site.url}${path}#product`,
    url: `${site.url}${path}`,
    name: type.fullName,
    description: [type.description, ...(type.longDescription ?? [])].join(" "),
    productGroupID: type.id,
    image: unique([
      type.image,
      ...Object.values(type.colorImages ?? {}),
      ...(type.gallery ?? []).map((p) => p.src),
    ]).map((src) => absolute(site, src)),
    brand: { "@type": "Brand", name: site.brandName },
    category: category.name,
    ...(type.material ? { material: type.material } : {}),
    variesBy: [
      "https://schema.org/size",
      ...(colors.length > 1 ? ["https://schema.org/color"] : []),
    ],
    hasVariant: variants.flatMap((v) => v.colors.map((c) => variant(site, category, type, v, c))),
  };
}

function breadcrumbs(site: Site, items: { name: string; path: string }[]) {
  const last = items.at(-1)!;
  return {
    "@type": "BreadcrumbList",
    "@id": `${site.url}${last.path}#breadcrumb`,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${site.url}${item.path}`,
    })),
  };
}

/** Lista "de resumen": cada elemento apunta a su página, que tiene los datos completos. */
const itemList = (site: Site, name: string, entries: { name: string; path: string }[]) => ({
  "@type": "ItemList",
  name,
  itemListElement: entries.map((e, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: e.name,
    url: `${site.url}${e.path}`,
  })),
});

export function structuredData(
  site: Site,
  categories: Category[],
  kind: Kind,
  meta: PageMeta,
  category: Category | null = null,
  type: ProductType | null = null,
  doc: LegalDoc | null = null,
) {
  const image = shareImage(category, type, kind === "shipping");
  const common = [organization(site), website(site)];
  const crumb = (items: { name: string; path: string }[]) => {
    const trail = breadcrumbs(site, items);
    return [trail, { "@id": trail["@id"] }] as const;
  };
  let page: object[];
  if (doc) {
    const [trail, ref] = crumb([
      { name: "Inicio", path: "/" },
      { name: doc.title, path: doc.path },
    ]);
    page = [webPage(site, "WebPage", meta, image, { breadcrumb: ref }), trail];
  } else if (kind === "shipping") {
    const [trail, ref] = crumb([
      { name: "Inicio", path: "/" },
      { name: "Envíos", path: SHIPPING_PATH },
    ]);
    page = [
      webPage(site, "FAQPage", meta, image, {
        breadcrumb: ref,
        mainEntity: shippingAnswers().map((a) => ({
          "@type": "Question",
          name: a.question,
          acceptedAnswer: { "@type": "Answer", text: a.answer },
        })),
      }),
      trail,
    ];
  } else if (category && type) {
    const [trail, ref] = crumb([
      { name: "Inicio", path: "/" },
      { name: category.name, path: catalogPath(category.id) },
      { name: type.fullName, path: catalogPath(category.id, type.id) },
    ]);
    const product = productGroup(site, category, type);
    page = [
      webPage(site, "ItemPage", meta, image, { breadcrumb: ref, mainEntity: { "@id": product["@id"] } }),
      product,
      trail,
    ];
  } else if (category) {
    const [trail, ref] = crumb([
      { name: "Inicio", path: "/" },
      { name: category.name, path: catalogPath(category.id) },
    ]);
    page = [
      webPage(site, "CollectionPage", meta, image, {
        breadcrumb: ref,
        mainEntity: itemList(
          site,
          category.name,
          category.types.map((t) => ({ name: t.fullName, path: catalogPath(category.id, t.id) })),
        ),
      }),
      trail,
    ];
  } else {
    page = [
      webPage(site, "WebPage", meta, image, {
        about: { "@id": id(site, "/", "organization") },
        mainEntity: itemList(
          site,
          `Catálogo ${site.brandName}`,
          categories.map((c) => ({ name: c.name, path: catalogPath(c.id) })),
        ),
      }),
    ];
  }
  return { "@context": "https://schema.org", "@graph": [...common, ...page] };
}

// ---------------------------------------------------------------- páginas

/** JSON dentro de <script>: `<` escapado para que ningún texto pueda cerrar la etiqueta. */
const jsonForScript = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

function replace(html: string, pattern: RegExp, by: (...groups: string[]) => string): string {
  if (!pattern.test(html)) throw new Error(`prerender: index.html sin ${pattern}`);
  return html.replace(pattern, by);
}

/** La foto del hero, pedida desde el HTML: sin esto el navegador la descubre recién con Angular (LCP). */
const HERO_PRELOAD =
  `<link rel="preload" as="image" href="assets/images/hero-piuma.webp" fetchpriority="high"` +
  ` imagesrcset="assets/images/hero-piuma-800w.webp 800w, assets/images/hero-piuma.webp 1600w"` +
  ` imagesizes="(min-width: 1024px) 560px, 100vw">`;

const shippingMeta = (site: Site): PageMeta => ({
  path: SHIPPING_PATH,
  title: policyTitle(FALLBACK_POLICY, site.brandName),
  description: policyDescription(FALLBACK_POLICY),
});

const legalMeta = (site: Site, doc: LegalDoc): PageMeta => ({
  path: doc.path,
  title: withBrand(doc.title, site.brandName),
  description: doc.description,
});

const notFoundMeta = (site: Site): PageMeta => ({
  path: NOT_FOUND_PATH,
  title: withBrand("Página no encontrada", site.brandName),
  description: `Esta página no existe. Mirá el catálogo de ${site.brandName}: sábanas, acolchados, fundas nórdicas, cubrecamas y almohadas.`,
});

function render(
  html: string,
  site: Site,
  categories: Category[],
  kind: Kind,
  category: Category | null = null,
  type: ProductType | null = null,
  doc: LegalDoc | null = null,
): Page {
  const meta =
    kind === "shipping"
      ? shippingMeta(site)
      : doc
        ? legalMeta(site, doc)
        : kind === "notFound"
        ? notFoundMeta(site)
        : pageMeta(site.brandName, category, type);
  const url = `${site.url}${meta.path}`;
  const image = shareImage(category, type, kind === "shipping");
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const imageUrl = escapeHtml(absolute(site, image.path));
  const imageAlt = escapeHtml(image.alt);
  const indexable = kind !== "notFound";
  const head = [
    ...(indexable
      ? [
          `<link rel="canonical" href="${url}">`,
          `<link rel="alternate" hreflang="${LANGUAGE}" href="${url}">`,
          `<link rel="alternate" hreflang="x-default" href="${url}">`,
          `<meta property="og:url" content="${url}">`,
        ]
      : [`<meta name="robots" content="noindex">`]),
    ...(kind === "home" ? [HERO_PRELOAD] : []),
    `<meta property="og:site_name" content="${escapeHtml(site.brandName)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${imageAlt}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${imageUrl}">`,
    `<meta name="twitter:image:alt" content="${imageAlt}">`,
    ...(indexable
      ? [
          `<script type="application/ld+json">${jsonForScript(
            structuredData(site, categories, kind, meta, category, type, doc),
          )}</script>`,
        ]
      : []),
    `<style>.prerender{display:none}</style>`,
    `<noscript><style>.prerender{display:block;padding:1rem}</style></noscript>`,
  ].join("\n    ");
  let out = replace(html, /<title>[^<]*<\/title>/, () => `<title>${title}</title>`);
  out = replace(out, /(<meta\s+name="description"\s+content=")[^"]*/, (_, a) => a + description);
  out = replace(out, /(<meta property="og:type" content=")[^"]*/, (_, a) =>
    a + (kind === "product" ? "product" : "website"),
  );
  out = replace(out, /(<meta property="og:title" content=")[^"]*/, (_, a) => a + title);
  out = replace(out, /(<meta\s+property="og:description"\s+content=")[^"]*/, (_, a) => a + description);
  out = replace(out, /(<meta property="og:image" content=")([^"]+)/, (_, a) => a + imageUrl);
  out = replace(out, /<\/head>/, () => `  ${head}\n  </head>`);
  out = replace(out, /<app-root><\/app-root>/, () =>
    `<app-root>${body(site, categories, kind, category, type, doc)}</app-root>`,
  );
  return { ...meta, html: out };
}

/**
 * Todas las páginas: inicio, /envios/, las legales (T89), cada categoría y cada producto, y al final 404.html, a partir
 * del index.html que deja `ng build`.
 */
export function prerenderPages(html: string, site: Site, categories: Category[]): Page[] {
  if (!/<base href="\/"\s*\/?>/.test(html))
    throw new Error('prerender: index.html necesita <base href="/"> para servirse en subrutas');
  return [
    render(html, site, categories, "home"),
    render(html, site, categories, "shipping"),
    ...siteLegalDocs(site).map((d) => render(html, site, categories, "legal", null, null, d)),
    ...categories.flatMap((c) => [
      render(html, site, categories, "category", c),
      ...c.types.map((t) => render(html, site, categories, "product", c, t)),
    ]),
    render(html, site, categories, "notFound"),
  ];
}

export function robotsTxt(site: Site): string {
  return [
    "User-agent: *",
    "Allow: /",
    ...PRIVATE_PATHS.map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: ${site.url}/sitemap.xml`,
    "",
  ].join("\n");
}

/** Sólo URLs indexables (sin 404 ni vistas privadas), con su foto. */
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

/**
 * /llms.txt (https://llmstxt.org): la marca, el catálogo por categoría con enlaces y las respuestas
 * de envío, compra y contacto, en Markdown para motores de IA. Sólo datos públicos del sitio: nada de
 * API, panel, dirección fiscal ni precios de demo.
 */
export function llmsTxt(site: Site, categories: Category[]): string {
  const [about, ...faq] = brandAnswers(site, categories);
  const sizes = (type: ProductType) => list(sortSizes(type.variants).map(sizeLabel));
  const colors = (type: ProductType) => list(unique(type.variants.flatMap((v) => v.colors)).map(lower));
  return [
    `# ${site.brandName}`,
    "",
    `> ${about!.answer} ${freeShippingLine(FALLBACK_POLICY)}`,
    "",
    `Sitio: ${site.url}/ · Idioma: español (Uruguay) · Moneda: pesos uruguayos (UYU).`,
    "",
    ...faq.flatMap((a) => [`**${a.question}** ${a.answer}`, ""]),
    "## Catálogo",
    "",
    ...categories.flatMap((c) => [
      `### [${c.name}](${site.url}${catalogPath(c.id)})`,
      "",
      categoryLead(c, site.brandName),
      "",
      ...c.types.map(
        (t) =>
          `- [${t.fullName}](${site.url}${catalogPath(c.id, t.id)}): ${t.description}` +
          (t.material ? ` Material: ${t.material}.` : "") +
          ` Medidas: ${sizes(t)}. Colores: ${colors(t)}.` +
          (site.offers ? ` Desde ${priceFrom(t)}.` : ""),
      ),
      "",
    ]),
    "## Envíos",
    "",
    `- [Envíos y entregas](${site.url}${SHIPPING_PATH}): ${policyDescription(FALLBACK_POLICY)}`,
    ...shippingAnswers().map((a) => `- ${a.question} ${a.answer}`),
    "",
    "## Contacto",
    "",
    `- WhatsApp: ${formatWhatsapp(site.whatsappNumber)} (https://wa.me/${site.whatsappNumber})`,
    `- Instagram: ${instagramHandle(site)} (${site.instagramUrl})`,
    ...(site.linktreeUrl ? [`- Linktree: ${site.linktreeUrl}`] : []),
    "",
    "## Opcional",
    "",
    `- [Mapa del sitio](${site.url}/sitemap.xml)`,
    ...LEGAL_PAGES.map((p) => `- [${p.label}](${site.url}${p.path})`),
    "",
  ].join("\n");
}

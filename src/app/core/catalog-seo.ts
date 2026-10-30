/**
 * URLs y metadatos de las páginas públicas del catálogo. Lo usan la app (al abrir una categoría o un
 * producto) y scripts/prerender.ts (al generar el HTML estático de cada URL), así que no importa Angular.
 *
 * /catalogo/<categoría>/            nivel 2 (tipos de una categoría)
 * /catalogo/<categoría>/<producto>/ nivel 3 (ficha)
 */
import type { Category, ProductType } from "../models/catalog.model";
import { FALLBACK_POLICY, freeShippingLine, list } from "./shipping-policy";
import { sortSizes } from "./sizes";

export interface PageMeta {
  path: string;
  title: string;
  description: string;
}

const SLUG = /^[a-z0-9-]+$/;

export function catalogPath(categoryId?: string | null, typeId?: string | null): string {
  if (!categoryId) return "/";
  return `/catalogo/${categoryId}/` + (typeId ? `${typeId}/` : "");
}

/** Inversa de catalogPath; `null` si la ruta no es del catálogo. */
export function parseCatalogPath(
  path: string,
): { categoryId: string; typeId: string | null } | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "catalogo" || parts.length < 2 || parts.length > 3) return null;
  if (!parts.slice(1).every((p) => SLUG.test(p))) return null;
  return { categoryId: parts[1], typeId: parts[2] ?? null };
}

/** Title ≤ 60 y description ≤ 155 caracteres, en todas las páginas (T88). */
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

/** Envío gratis de la política de Piuma: el prerender no tiene API y la description es estática. */
const FREE_SHIPPING = freeShippingLine(FALLBACK_POLICY);

export const HOME_META = {
  title: "Piuma | Ropa de cama en Uruguay: sábanas y acolchados",
  description: `Sábanas, acolchados, fundas nórdicas, cubrecamas y almohadas de algodón, pluma y lino. ${FREE_SHIPPING}`,
};

/**
 * Title y primera frase de cada categoría, escritos a mano a partir del catálogo (materiales y
 * nombres de catalog.json, sin inventar). Una categoría nueva sin entrada usa su nombre.
 */
const CATEGORY_COPY: Record<string, { title: string; lead: string }> = {
  acolchados: {
    title: "Acolchados de pluma natural y sintética",
    lead: "Acolchados de pluma natural y sintética con tela 100% algodón downproof, y rellenos nórdicos.",
  },
  "fundas-nordicas": {
    title: "Fundas nórdicas de algodón y lino",
    lead: "Fundas nórdicas Downproof, de satén 300 hilos y de lino y algodón, con fundas de almohada incluidas.",
  },
  sabanas: {
    title: "Sábanas 100% algodón: percal y satén",
    lead: "Juegos de sábanas 100% algodón en percal 200 hilos y satén 300 hilos, con fundas de almohada.",
  },
  cubrecamas: {
    title: "Cubrecamas 100% algodón con fundas incluidas",
    lead: "Cubrecamas 100% algodón con fundas de almohada de 50x70 cm incluidas.",
  },
  almohadas: {
    title: "Almohadas de pluma y fundas de almohada",
    lead: "Almohadas de pluma natural con funda de algodón y fundas de almohada 100% algodón.",
  },
};

/** Frases enteras hasta DESCRIPTION_MAX: sin cortar una palabra ni dejar "…" en el buscador. */
function sentences(parts: string[]): string {
  let out = "";
  for (const part of parts.filter(Boolean)) {
    const next = out ? `${out} ${part}` : part;
    if (next.length > DESCRIPTION_MAX) continue;
    out = next;
  }
  return out || parts[0]!.slice(0, DESCRIPTION_MAX);
}

const unique = (values: string[]) => [...new Set(values)];
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const dot = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/** "Medidas de Twin a Super King." o "Medidas: 50x70 y 50x90." */
function sizesLine(types: ProductType[]): string {
  const sizes = unique(sortSizes(types.flatMap((t) => t.variants)).map((v) => v.size));
  if (!sizes.length) return "";
  return sizes.length > 3
    ? `Medidas de ${sizes[0]} a ${sizes.at(-1)}.`
    : `${sizes.length > 1 ? "Medidas" : "Medida"}: ${list(sizes)}.`;
}

function colorsLine(types: ProductType[]): string {
  const colors = unique(types.flatMap((t) => t.variants.flatMap((v) => v.colors))).map(lower);
  if (!colors.length) return "";
  return colors.length > 1 ? `Colores: ${list(colors)}.` : `Color: ${colors[0]}.`;
}

export const withBrand = (title: string, brand: string) =>
  `${title} | ${brand}`.length <= TITLE_MAX ? `${title} | ${brand}` : title.slice(0, TITLE_MAX);

export function categoryTitle(category: Category): string {
  return CATEGORY_COPY[category.id]?.title ?? category.name;
}

/** Primera frase de la categoría: la description y el texto del prerender. */
export function categoryLead(category: Category, brandName: string): string {
  return (
    CATEGORY_COPY[category.id]?.lead ??
    `${category.name} ${brandName}: ${list(category.types.map((t) => t.name))}.`
  );
}

export function pageMeta(
  brandName: string,
  category?: Category | null,
  type?: ProductType | null,
): PageMeta {
  if (category && type) {
    const material = type.material ? `, ${lower(type.material)}` : "";
    return {
      path: catalogPath(category.id, type.id),
      title: withBrand(type.fullName, brandName),
      description: sentences([
        `${type.fullName}${material}.`,
        dot(type.description),
        type.includes ? dot(type.includes) : "",
        sizesLine([type]),
        FREE_SHIPPING,
        colorsLine([type]),
      ]),
    };
  }
  if (category) {
    return {
      path: catalogPath(category.id),
      title: withBrand(categoryTitle(category), brandName),
      description: sentences([
        categoryLead(category, brandName),
        sizesLine(category.types),
        FREE_SHIPPING,
        colorsLine(category.types),
      ]),
    };
  }
  return { path: "/", ...HOME_META };
}

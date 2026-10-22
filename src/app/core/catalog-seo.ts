/**
 * URLs y metadatos de las páginas públicas del catálogo. Lo usan la app (al abrir una categoría o un
 * producto) y scripts/prerender.ts (al generar el HTML estático de cada URL), así que no importa Angular.
 *
 * /catalogo/<categoría>/            nivel 2 (tipos de una categoría)
 * /catalogo/<categoría>/<producto>/ nivel 3 (ficha)
 */
import type { Category, ProductType } from "../models/catalog.model";

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

export const HOME_META = {
  title: "Piuma — Ropa de cama de calidad | Sábanas, fundas y cubrecamas",
  description:
    "Piuma: ropa de cama pensada para el descanso. Sábanas, fundas nórdicas, almohadas y cubrecamas en algodón y lino de calidad. Consultá por WhatsApp.",
};

/** Meta descriptions de ~155 caracteres como máximo, cortadas en una palabra. */
function clip(text: string, max = 155): string {
  if (text.length <= max) return text;
  return text.slice(0, text.lastIndexOf(" ", max - 1)).replace(/[,.;:]$/, "") + "…";
}

export function pageMeta(
  brandName: string,
  category?: Category | null,
  type?: ProductType | null,
): PageMeta {
  if (category && type) {
    const material = type.material ? ` ${type.material}.` : "";
    return {
      path: catalogPath(category.id, type.id),
      title: `${type.fullName} | ${brandName}`,
      description: clip(
        `${type.fullName}: ${type.description}${material} Medidas ${type.variants
          .map((v) => v.size)
          .join(", ")}. Consultá por WhatsApp.`,
      ),
    };
  }
  if (category) {
    return {
      path: catalogPath(category.id),
      title: `${category.name} | ${brandName}`,
      description: clip(
        `${category.name} ${brandName}: ${category.types
          .map((t) => t.name)
          .join(", ")}. Ropa de cama de calidad, consultá medidas y colores por WhatsApp.`,
      ),
    };
  }
  return { path: "/", ...HOME_META };
}

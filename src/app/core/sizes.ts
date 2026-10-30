// Orden de las medidas en el selector y en las tablas (cambios del cliente, T91): de menor a mayor,
// sin depender del orden del JSON ni del que devuelve el API (que viene por SKU).
// Framework-free so node --test can load it.
import type { Category, Variant } from "../models/catalog.model";

/** De la cama más chica a la más grande; las almohadas, de 50x70 a 50x90. */
export const SIZE_ORDER = [
  "Twin",
  "Plaza y media",
  "Dos plazas / Full",
  "Queen",
  "King",
  "Super King",
  "50x70",
  "50x90",
];

/** "Dos plazas" (cubrecamas) es la misma medida que "Dos plazas / Full". */
const ALIASES: Record<string, string> = { "Dos plazas": "Dos plazas / Full" };

function rank(size: string): number {
  const index = SIZE_ORDER.indexOf(ALIASES[size] ?? size);
  return index < 0 ? SIZE_ORDER.length : index;
}

/** Las variantes de menor a mayor; una medida desconocida va al final, en el orden en que vino. */
export function sortSizes<T extends Pick<Variant, "size">>(variants: T[]): T[] {
  return [...variants].sort((a, b) => rank(a.size) - rank(b.size));
}

/** El catálogo con las medidas de cada producto ordenadas, sin tocar el original. */
export function sortCatalogSizes(categories: Category[]): Category[] {
  return categories.map((category) => ({
    ...category,
    types: category.types.map((type) => ({ ...type, variants: sortSizes(type.variants) })),
  }));
}

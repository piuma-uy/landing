// Textos de la ficha que salen del stock del API (T69).
// Framework-free so node --test can load it.
import type { Variant } from "../models/catalog.model";

/** Unidades desde las que la ficha avisa que quedan pocas. */
export const LOW_STOCK = 3;

/** "Agotado" sólo con stock del API: el catálogo estático no sabe cuánto hay. */
export function colorSoldOut(variant: Variant, color: string): boolean {
  const stock = variant.stockByColor;
  return !!stock && (stock[color] ?? 0) < 1;
}

/** La medida está agotada cuando ninguno de sus colores tiene stock. */
export function sizeSoldOut(variant: Variant): boolean {
  return variant.colors.every((color) => colorSoldOut(variant, color));
}

/** Línea de stock al lado del precio: pocas unidades se dicen distinto que muchas. */
export function stockLabel(stock: number): { text: string; tone: "ok" | "low" | "out" } {
  if (stock < 1) return { text: "Sin stock por el momento", tone: "out" };
  if (stock === 1) return { text: "Queda 1 disponible", tone: "low" };
  if (stock <= LOW_STOCK) return { text: `Quedan ${stock} disponibles`, tone: "low" };
  return { text: `${stock} disponibles`, tone: "ok" };
}

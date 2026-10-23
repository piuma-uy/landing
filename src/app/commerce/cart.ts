// Cart rules the browser applies before asking the API (which re-checks stock and prices).
// Framework-free so it can be unit tested with `node --test` (see tests/cart.test.ts).
import type { Line, Product } from "./commerce.service";

/**
 * Same limits as POST /orders: units per variant and variants per order (T52-R1). The API cart
 * still takes 20 × 20 so old saved carts load; checkout asks to lower them first.
 */
export const MAX_UNITS = 10;
export const MAX_LINES = 10;
const LIMITS = `Máximo ${MAX_UNITS} unidades por variante y ${MAX_LINES} variantes por pedido`;

/** Guest cart from localStorage; anything malformed is dropped, quantities capped at the limit. */
export function guestCart(raw: string | null): Line[] {
  try {
    const x = JSON.parse(raw ?? "[]");
    return Array.isArray(x)
      ? x
          .filter(
            (l: Line) =>
              typeof l?.sku === "string" &&
              Number.isInteger(l.quantity) &&
              l.quantity > 0,
          )
          .slice(0, MAX_LINES)
          .map((l: Line) => ({
            sku: l.sku,
            quantity: Math.min(l.quantity, MAX_UNITS),
          }))
      : [];
  } catch {
    return [];
  }
}

/** Server cart plus the guest one; null when the union would exceed the variant limit. */
export function mergeGuest(remote: Line[], guest: Line[]): Line[] | null {
  const merged = new Map(remote.map((l) => [l.sku, l.quantity]));
  for (const l of guest)
    merged.set(
      l.sku,
      Math.min(MAX_UNITS, (merged.get(l.sku) ?? 0) + l.quantity),
    );
  if (merged.size > MAX_LINES) return null;
  return [...merged].map(([sku, quantity]) => ({ sku, quantity }));
}

/** One more unit of `sku`, or an error the buyer can read. */
export function addUnit(
  cart: Line[],
  products: Product[] | null,
  sku: string,
): Line[] {
  const product = products?.find((p) => p.sku === sku);
  const existing = cart.find((l) => l.sku === sku);
  const quantity = (existing?.quantity ?? 0) + 1;
  if (!product || product.stock < quantity)
    throw new Error("No hay más stock disponible de esta variante");
  if (quantity > MAX_UNITS || (!existing && cart.length >= MAX_LINES))
    throw new Error(LIMITS);
  return existing
    ? cart.map((l) => (l.sku === sku ? { sku, quantity } : l))
    : [...cart, { sku, quantity }];
}

/** Sets a line's quantity; 0 removes it. */
export function setQuantity(cart: Line[], sku: string, value: number): Line[] {
  if (!Number.isInteger(value) || value < 0 || value > MAX_UNITS)
    throw new Error(`Cantidad válida: 0 a ${MAX_UNITS}`);
  return value
    ? cart.map((l) => (l.sku === sku ? { sku, quantity: value } : l))
    : cart.filter((l) => l.sku !== sku);
}

/** A cart saved before the lower order limits: the buyer adjusts it before checkout. */
export function orderLimitProblem(cart: Line[]) {
  return cart.length > MAX_LINES || cart.some((l) => l.quantity > MAX_UNITS)
    ? LIMITS + ". Ajustá el carrito para continuar."
    : null;
}

export function unitCount(cart: Line[]): number {
  return cart.reduce((s, l) => s + l.quantity, 0);
}

/** Estimate shown in the cart; the order total always comes from the API quote. */
export function estimateMinor(cart: Line[], products: Product[] | null) {
  return cart.reduce(
    (s, l) =>
      s +
      (products?.find((p) => p.sku === l.sku)?.priceMinor ?? 0) * l.quantity,
    0,
  );
}

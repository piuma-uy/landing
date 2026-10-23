// Unpaid orders and their reservations (T52-H1 contract). Framework-free so node --test can load it.
import type { OrderTransfer } from "./transfer";

/** Minimal order shape this module reads. */
export interface ReservedOrder {
  status: string;
  transfer?: Pick<OrderTransfer, "expiresAt">;
  cardExpiresAt?: string;
  pendingExpiresAt?: string;
}

/** POST /orders: the buyer already holds settings.orders.maxOpenPerUser unpaid orders. */
export const TOO_MANY_OPEN_ORDERS = "TOO_MANY_OPEN_ORDERS";
export const OPEN_ORDERS_LIMIT =
  "Ya tenés el máximo de pedidos sin pagar. Para crear otro, pagá uno de tus pedidos o esperá a que venza su reserva.";

/** Shown in Montevideo time whatever the device zone (Uruguay has no daylight saving). */
const FORMAT = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "24/10/2026 12:00"; with `at`, "24/10/2026 a las 12:00". Empty for a missing or bad date. */
export function dateTime(iso: string | null | undefined, at = false) {
  const date = new Date(iso ?? "");
  if (Number.isNaN(date.getTime())) return "";
  const p = Object.fromEntries(
    FORMAT.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${p["day"]}/${p["month"]}/${p["year"]}${at ? " a las " : " "}${p["hour"]}:${p["minute"]}`;
}

/**
 * When the stock of an unpaid order is released if nobody pays: the transfer deadline, the
 * card hold or the hold of an order without payment method. Null once paid or cancelled, and
 * for orders created before the API stored a deadline.
 */
export function reservedUntil(order: ReservedOrder) {
  if (order.status !== "pending_payment" && order.status !== "pending_transfer")
    return null;
  return (
    order.transfer?.expiresAt ??
    order.cardExpiresAt ??
    order.pendingExpiresAt ??
    null
  );
}

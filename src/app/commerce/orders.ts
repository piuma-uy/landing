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
/** POST /orders: unpaid orders would hold more than maxUnitsPerUser units, or maxUnitsPerSku of one. */
export const RESERVATION_LIMIT = "RESERVATION_LIMIT";
/** POST /orders: paymentMethod=pending while the shop offers transfer or card. */
export const PAYMENT_METHOD_REQUIRED = "PAYMENT_METHOD_REQUIRED";
export const OPEN_ORDERS_LIMIT =
  "Ya tenés el máximo de pedidos sin pagar. Para crear otro, pagá o cancelá uno de tus pedidos, o esperá a que venza su reserva.";
export const CHOOSE_PAYMENT =
  "Elegí transferencia o tarjeta para confirmar el pedido.";
/** Limits on what the buyer already reserved: the way out goes through "Mis pedidos". */
export const ORDERS_LINK_CODES = [TOO_MANY_OPEN_ORDERS, RESERVATION_LIMIT];

/**
 * What the buyer reads when POST /orders refuses a reservation limit (nothing was reserved), or
 * null to keep the API message. RESERVATION_LIMIT keeps it: it carries the current numbers.
 */
export function checkoutLimitMessage(
  code: string | undefined,
  message: string,
) {
  switch (code) {
    case TOO_MANY_OPEN_ORDERS:
      return OPEN_ORDERS_LIMIT;
    case RESERVATION_LIMIT:
      return message.replace(/\.?$/, ".");
    case PAYMENT_METHOD_REQUIRED:
      return CHOOSE_PAYMENT;
    default:
      return null;
  }
}

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

/** POST /orders/{id}/cancel: Mercado Pago is processing a payment of the order; nothing changed. */
export const PAYMENT_IN_PROGRESS = "PAYMENT_IN_PROGRESS";
/** POST /orders/{id}/cancel: the order is no longer unpaid (paid meanwhile, or approved just now). */
export const INVALID_ORDER_STATE = "INVALID_ORDER_STATE";
export const ORDER_CANCELLED =
  "Pedido cancelado. Liberamos los productos que tenía reservados.";

/** Unpaid orders the buyer can cancel (POST /orders/{id}/cancel, T55a-R5). */
export function buyerCancellable(order: Pick<ReservedOrder, "status">) {
  return (
    order.status === "pending_payment" || order.status === "pending_transfer"
  );
}

/** What the buyer reads when the API refuses the cancellation, or null to keep its message. */
export function cancelErrorMessage(code: string | undefined) {
  switch (code) {
    case PAYMENT_IN_PROGRESS:
      return "Mercado Pago está procesando un pago de este pedido. Esperá unos minutos y revisá su estado antes de cancelarlo.";
    case INVALID_ORDER_STATE:
      return "Este pedido ya no se puede cancelar: cambió de estado mientras tanto. Te mostramos cómo quedó.";
    default:
      return null;
  }
}

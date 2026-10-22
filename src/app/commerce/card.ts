// Mercado Pago Checkout Pro (T20 contract). Framework-free so node --test can load it.
// The browser only starts the hosted checkout and shows what GET /orders/{id} says: the
// return URL and its query params never mark anything paid.
import type { PaymentMethods } from "./transfer";

/** Minimal order shape this module reads. */
export interface CardOrder {
  id: string;
  status: string;
  paymentMethod: string;
  cardStatus?: "pending" | "failed";
}
export interface Checkout {
  checkoutId: string;
  redirectUrl: string;
}
export type CardRequest = <T>(
  path: string,
  method?: string,
  body?: unknown,
  headers?: Record<string, string>,
) => Promise<T>;
/** What the return page shows; only the API order decides it. */
export type PaymentState =
  | "paid"
  | "pending"
  | "failed"
  | "transfer"
  | "cancelled";

export function cardOffered(methods: PaymentMethods | null) {
  return !!methods?.card.enabled && methods.card.provider === "mercadopago";
}

const ORDER_ID = /^[a-f0-9]{64}$/;
/** Mercado Pago comes back to /pago?order=<id>&result=…; /pago/aprobado|pendiente|rechazado too. */
const RETURN_PATH = /^\/pago(?:\/(?:aprobado|pendiente|rechazado))?\/?$/;
export function paymentReturn(url: URL) {
  const orderId = url.searchParams.get("order") ?? "";
  return RETURN_PATH.test(url.pathname) && ORDER_ID.test(orderId)
    ? orderId
    : null;
}

export function paymentState(order: CardOrder): PaymentState {
  if (order.status === "paid") return "paid";
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "pending_transfer") return "transfer";
  return order.cardStatus === "failed" ? "failed" : "pending";
}

/**
 * Only the hosted checkout of Mercado Pago (or a local http simulator) is followed: an
 * unexpected URL from a misconfigured API is not opened.
 */
export function checkoutUrl(checkout: Checkout | undefined) {
  try {
    const url = new URL(checkout?.redirectUrl ?? "");
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    return url.protocol === "https:" || (local && url.protocol === "http:")
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Short polling with growing waits (~30 s in total) while the webhook arrives. */
export const POLL_DELAYS = [0, 1000, 1500, 2500, 4000, 6000, 8000, 10000];
export async function pollOrder<T extends CardOrder>(
  load: () => Promise<T>,
  options: {
    delays?: number[];
    sleep?: (ms: number) => Promise<void>;
    onUpdate?: (order: T) => void;
  } = {},
) {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let order: T | undefined;
  for (const ms of options.delays ?? POLL_DELAYS) {
    if (ms) await sleep(ms);
    order = await load();
    options.onUpdate?.(order);
    if (paymentState(order) !== "pending") break;
  }
  return order!;
}

export class CardApi {
  private readonly request: CardRequest;
  private readonly storage: Pick<Storage, "getItem" | "setItem">;
  private readonly newKey: () => string;
  constructor(
    request: CardRequest,
    storage: Pick<Storage, "getItem" | "setItem">,
    newKey: () => string,
  ) {
    this.request = request;
    this.storage = storage;
    this.newKey = newKey;
  }
  order<T extends CardOrder>(orderId: string) {
    return this.request<T>("/orders/" + encodeURIComponent(orderId));
  }
  /** Same preference on every call for the order; the API charges its snapshot total. */
  checkout(orderId: string) {
    return this.request<Checkout>(
      "/orders/" + encodeURIComponent(orderId) + "/payment",
      "POST",
      {},
    );
  }
  /**
   * Card rejected: move the same order (and its reservation) to bank transfer. One key per
   * order, kept until the answer arrives, so a retry after a timeout replays it.
   */
  switchToTransfer<T extends CardOrder>(orderId: string) {
    const slot = "piuma-switch-" + orderId;
    let key = this.storage.getItem(slot);
    if (!key) {
      key = this.newKey();
      this.storage.setItem(slot, key);
    }
    return this.request<T>(
      "/orders/" + encodeURIComponent(orderId) + "/payment-method",
      "POST",
      { paymentMethod: "transfer" },
      { "Idempotency-Key": key },
    );
  }
}

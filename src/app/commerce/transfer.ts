// Bank transfer and shop settings (T23 contract). Framework-free so node --test can load it.
import { deadline } from "./orders";
import {
  shippingSummary,
  zoneLabel,
  type ShippingQuote,
  type ShippingSettings,
} from "./shipping";
export interface TransferInstructions {
  bank: string;
  accountType: string;
  accountNumber: string;
  holder: string;
  currency: string;
  note: string;
}
/** Snapshot the API stores on a transfer order; later settings changes do not alter it. */
export interface OrderTransfer {
  instructions: TransferInstructions;
  amountMinor: number;
  currency: string;
  /** What the buyer writes in the transfer concept: their phone since T70, before it the order code. */
  reference: string;
  /** "phone" since T70; "order" (or absent, older API) when reference is the order code. */
  referenceType?: "phone" | "order";
  /** Hours the products are reserved for; absent on orders from before T70. */
  holdHours?: number;
  expiresAt: string;
  whatsappUrl: string;
}
export interface PaymentMethods {
  transfer: {
    enabled: boolean;
    instructions: TransferInstructions | null;
    holdHours: number | null;
  };
  card: {
    enabled: boolean;
    provider?: "mercadopago" | null;
    reason?: string | null;
  };
}
export interface Settings {
  transfer: {
    enabled: boolean;
    instructions: TransferInstructions;
    holdHours: number;
  };
  /** Hours to pay a card order before its reservation is released. */
  card: { holdHours: number };
  /**
   * Unpaid orders per buyer and hold of orders without payment method (T52-H1); units those
   * orders may hold in total and per SKU (T52-R1, absent from an API without them).
   */
  orders: {
    maxOpenPerUser: number;
    maxUnitsPerUser?: number;
    maxUnitsPerSku?: number;
    pendingHoldHours: number;
  };
  contact: { whatsappNumber: string | null };
  notifications: { whatsappEnabled: boolean; shopEmail: string | null };
  shipping: ShippingSettings;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
}
/** Minimal order shape this module reads. */
export interface TransferOrder {
  id: string;
  status: string;
  totalMinor: number;
  currency: string;
  paymentMethod: string;
  cancelledBy?: string;
  transfer?: OrderTransfer;
}
/** Error with the HTTP status and API code, so callers can react to 409 and friends. */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export type Request = <T>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;
/** Who cancels orders whose transfer did not arrive in time (backend expiry job). */
export const EXPIRY_PRINCIPAL = "system:transfer-expiry";
/** The same hourly job for card orders and orders without payment method past their hold. */
export const EXPIRY_PRINCIPALS = [
  EXPIRY_PRINCIPAL,
  "system:card-expiry",
  "system:pending-expiry",
];
/** Code Piuma knows the order by (mails, WhatsApp); the transfer reference before T70. */
export const orderCode = (order: Pick<TransferOrder, "id">) =>
  order.id.slice(0, 8).toUpperCase();
/** The buyer quotes their phone in the transfer (T70) rather than the order code. */
export const phoneReference = (t: Pick<OrderTransfer, "referenceType">) =>
  t.referenceType === "phone";
/**
 * Where the order goes, for "¿Estás seguro?" before confirming a transfer (T74): the zone as the
 * buyer read it, or pickup as the row says it.
 */
export function orderZone(shipping: ShippingQuote | undefined) {
  return shipping?.method === "delivery"
    ? zoneLabel(shipping.zoneName)
    : shippingSummary(shipping);
}
/** "Te reservamos los productos por 48 horas, hasta el martes 28/10 a las 18:58 (hora de Uruguay)." */
export function reservationText(
  t: Pick<OrderTransfer, "holdHours" | "expiresAt">,
) {
  const hours = t.holdHours
    ? ` por ${t.holdHours} ${t.holdHours === 1 ? "hora" : "horas"},`
    : "";
  return `Te reservamos los productos${hours} hasta el ${deadline(t.expiresAt)} (hora de Uruguay).`;
}
/** The shop's promise once the money arrives: the mail is automatic, the call is Piuma's. */
export const CONFIRMATION_PROMISE =
  "Te confirmamos por mail y por teléfono apenas se acrediten los fondos.";
/** Search of "Transferencias por confirmar" (T70): GET /admin/orders?status=pending_transfer. */
export type TransferSearch = { phone: string } | { name: string };
/**
 * What the administrator typed: digits search by phone (the API ignores 0/+598 and spaces),
 * anything else by name. null when it is too short to search (under 4 digits or 2 letters).
 */
export function transferSearch(input: string): TransferSearch | null {
  const q = input.trim().slice(0, 100);
  if (/^[+0-9 ().-]+$/.test(q))
    return q.replace(/\D/g, "").length >= 4 ? { phone: q } : null;
  return q.length >= 2 ? { name: q } : null;
}
/** Last 8 digits: the same phone typed with 0, +598 or spaces gives the same key. */
export const phoneKey = (phone: string | undefined) =>
  (phone ?? "").replace(/\D/g, "").slice(-8);
/** The buyer's phone in the panel: Uruguayan mobiles saved as E.164 (T71) read 091 813 234. */
export function phoneDisplay(phone: string | undefined) {
  const uy = /^\+598(9\d)(\d{3})(\d{3})$/.exec(phone ?? "");
  return uy ? `0${uy[1]} ${uy[2]} ${uy[3]}` : (phone ?? "");
}
/** How many of these orders share each phone, by phoneKey. */
export function phoneCounts(orders: { contact?: { phone: string } }[]) {
  const counts = new Map<string, number>();
  for (const o of orders) {
    const key = phoneKey(o.contact?.phone);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
export function transferOffered(methods: PaymentMethods | null) {
  return !!methods?.transfer.enabled && !!methods.transfer.instructions;
}
export function statusLabel(
  order: Pick<TransferOrder, "status" | "cancelledBy">,
) {
  if (
    order.status === "cancelled" &&
    EXPIRY_PRINCIPALS.includes(order.cancelledBy ?? "")
  )
    return "Vencido";
  return (
    (
      {
        pending_payment: "Pendiente de pago",
        pending_transfer: "Pendiente de transferencia",
        paid: "Pagado",
        cancelled: "Cancelado",
      } as Record<string, string>
    )[order.status] ?? order.status
  );
}
/**
 * PUT /admin/settings body: full replacement, blanks become null, versioned. shipping goes
 * as given (normalize it with shippingInput first); without shipping, card or orders the API
 * keeps the saved ones.
 */
export function settingsInput(s: Settings) {
  const text = (v: string | null) => v?.trim() || null;
  return {
    transfer: {
      enabled: s.transfer.enabled,
      instructions: Object.fromEntries(
        Object.entries(s.transfer.instructions).map(([k, v]) => [k, v.trim()]),
      ) as unknown as TransferInstructions,
      holdHours: s.transfer.holdHours,
    },
    ...(s.card ? { card: { holdHours: s.card.holdHours } } : {}),
    ...(s.orders
      ? {
          orders: {
            maxOpenPerUser: s.orders.maxOpenPerUser,
            // Omitted unit limits keep the saved ones.
            ...(s.orders.maxUnitsPerUser !== undefined
              ? { maxUnitsPerUser: s.orders.maxUnitsPerUser }
              : {}),
            ...(s.orders.maxUnitsPerSku !== undefined
              ? { maxUnitsPerSku: s.orders.maxUnitsPerSku }
              : {}),
            pendingHoldHours: s.orders.pendingHoldHours,
          },
        }
      : {}),
    contact: { whatsappNumber: text(s.contact.whatsappNumber) },
    notifications: {
      whatsappEnabled: s.notifications.whatsappEnabled,
      shopEmail: text(s.notifications.shopEmail),
    },
    ...(s.shipping ? { shipping: s.shipping } : {}),
    expectedVersion: s.version,
  };
}
export class TransferApi {
  private readonly request: Request;
  constructor(request: Request) {
    this.request = request;
  }
  paymentMethods() {
    return this.request<PaymentMethods>("/payment-methods");
  }
  /** Every page of transfers awaiting confirmation, soonest expiry first; optionally searched. */
  async pending<T extends TransferOrder>(search?: TransferSearch) {
    const rows: T[] = [];
    const filter = search
      ? Object.entries(search)
          .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
          .join("")
      : "";
    let cursor: string | undefined;
    do {
      const page: { items: T[]; nextCursor?: string } = await this.request(
        "/admin/orders?status=pending_transfer" +
          filter +
          (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
      );
      rows.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return rows;
  }
  /**
   * The administrator saw the money at the bank: amount and currency come from the order. The
   * bank's movement id is optional (T74) and only sent when typed.
   */
  confirm<T extends TransferOrder>(order: T, bankReference = "") {
    const reference = bankReference.trim();
    return this.request<T>(
      "/admin/orders/" + encodeURIComponent(order.id) + "/confirm-transfer",
      "POST",
      {
        ...(reference && { bankReference: reference }),
        amountMinor: order.transfer?.amountMinor ?? order.totalMinor,
        currency: order.transfer?.currency ?? order.currency,
      },
    );
  }
  cancel<T extends TransferOrder>(order: T, reason: string) {
    return this.request<T>(
      "/admin/orders/" + encodeURIComponent(order.id) + "/cancel",
      "POST",
      { reason: reason.trim() },
    );
  }
  settings() {
    return this.request<Settings>("/admin/settings");
  }
  /**
   * Saves with optimistic concurrency. On 409 returns the current server settings so the
   * form shows what is stored, plus a message; any other failure propagates.
   */
  async saveSettings(
    s: Settings,
  ): Promise<{ settings: Settings; conflict: boolean }> {
    try {
      return {
        settings: await this.request<Settings>(
          "/admin/settings",
          "PUT",
          settingsInput(s),
        ),
        conflict: false,
      };
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 409) throw e;
      return { settings: await this.settings(), conflict: true };
    }
  }
}

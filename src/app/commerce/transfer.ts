// Bank transfer and shop settings (T23 contract). Framework-free so node --test can load it.
import type { ShippingSettings } from "./shipping";
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
  reference: string;
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
export const SETTINGS_CONFLICT =
  "Otro cambio de configuración se guardó antes. Cargamos la versión actual: revisala y volvé a guardar.";
export function transferOffered(methods: PaymentMethods | null) {
  return !!methods?.transfer.enabled && !!methods.transfer.instructions;
}
export function statusLabel(
  order: Pick<TransferOrder, "status" | "cancelledBy">,
) {
  if (order.status === "cancelled" && order.cancelledBy === EXPIRY_PRINCIPAL)
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
 * The API builds the WhatsApp link (shop number and prefilled message); the browser only
 * opens it. Anything that is not a wa.me https URL is dropped instead of rendered.
 */
export function whatsappLink(transfer: OrderTransfer | undefined) {
  try {
    const url = new URL(transfer?.whatsappUrl ?? "");
    return url.protocol === "https:" && url.hostname === "wa.me"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/**
 * PUT /admin/settings body: full replacement, blanks become null, versioned. shipping goes
 * as given (normalize it with shippingInput first); without it the API keeps the saved one.
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
  /** Every page of transfers awaiting confirmation, soonest expiry first. */
  async pending<T extends TransferOrder>() {
    const rows: T[] = [];
    let cursor: string | undefined;
    do {
      const page: { items: T[]; nextCursor?: string } = await this.request(
        "/admin/orders?status=pending_transfer" +
          (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
      );
      rows.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return rows;
  }
  /** The administrator saw the money at the bank: amount and currency come from the order. */
  confirm<T extends TransferOrder>(order: T, bankReference: string) {
    return this.request<T>(
      "/admin/orders/" + encodeURIComponent(order.id) + "/confirm-transfer",
      "POST",
      {
        bankReference: bankReference.trim(),
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

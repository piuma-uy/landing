// Checkout decisions that do not need Angular: which payment method to send and the
// lifecycle of the Idempotency-Key a confirmation reuses. Unit tested with `node --test` (tests/checkout.test.ts).
import type { PayWith } from "./commerce.service";
import { pickupLabel, streetLine, type Address } from "./shipping";

/** The checkout's steps on the phone and the desktop (T72): each one opens when it is the buyer's turn. */
export type CheckoutStep = "datos" | "entrega" | "pago";
export const CHECKOUT_STEPS: CheckoutStep[] = ["datos", "entrega", "pago"];

/** After the review: Entrega when there is something to choose, straight to Pago with pickup only. */
export function stepAfterReview(
  options: { delivery: { enabled: boolean } } | null,
): CheckoutStep {
  return options?.delivery.enabled ? "entrega" : "pago";
}

/** "1 producto", "3 productos": units, as the header's cart counts them. */
export function unitsLabel(units: number) {
  return units === 1 ? "1 producto" : `${units} productos`;
}

/**
 * The one line a finished "Entrega" keeps: "Envío a Pocitos · Av. Brasil 2550, Apto 502" or
 * "Retiro sin costo · Showroom en Pocitos". `place` is null for pickup.
 */
export function deliveryLine(
  place: string | null,
  address: Pick<Address, "street" | "unit">,
  pickupDetails: string | undefined,
) {
  if (place === null) return "Retiro sin costo · " + pickupLabel(pickupDetails);
  const street = streetLine(address).trim();
  return `Envío a ${place}` + (street ? ` · ${street}` : "");
}

/** Transfer first when the shop has it on, then card; otherwise the unpaid reservation. */
export function defaultPayWith(transfer: boolean, card: boolean): PayWith {
  return transfer ? "transfer" : card ? "card" : "pending";
}

/** The buyer's choice, as long as the API still offers it. */
export function paymentMethodFor(
  payWith: PayWith,
  transfer: boolean,
  card: boolean,
): PayWith {
  return payWith === "transfer" && transfer
    ? "transfer"
    : payWith === "card" && card
      ? "card"
      : "pending";
}

export interface Attempt {
  fingerprint: string;
  key: string;
}

/**
 * The same order (user + payload) keeps its Idempotency-Key across retries and reloads, so a
 * lost response never creates a second order; anything else changed starts a new attempt.
 */
export function checkoutAttempt(
  stored: string | null,
  fingerprint: string,
  newKey: () => string,
): Attempt {
  let attempt: Attempt | null = null;
  try {
    attempt = JSON.parse(stored ?? "null");
  } catch {}
  return attempt?.fingerprint === fingerprint && typeof attempt.key === "string"
    ? attempt
    : { fingerprint, key: newKey() };
}

/** sessionStorage slot of the attempt whose result is still unknown. */
export const ATTEMPT_SLOT = "piuma-checkout";

/**
 * Hex SHA-256 of the fingerprint (user, cart, address, phone): equality is all the attempt
 * needs, so the personal data never reaches sessionStorage in clear (FE-06).
 */
export async function fingerprintHash(fingerprint: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(fingerprint),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** Prefix of every sessionStorage slot the shop writes; logout() drops them all. */
export const SESSION_PREFIX = "piuma-";

/** Removes the shop's sessionStorage slots (checkout attempt, switch keys, payment return…). */
export function clearSession(
  storage: Pick<Storage, "key" | "length" | "removeItem">,
) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(SESSION_PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

/**
 * One Idempotency-Key per checkout attempt: kept while the result is unknown (timeout, network,
 * 5xx, reload) and dropped once the API created the order, the cart changed or the buyer left.
 * The API keeps every order under its key, so a stale key would replay the previous order.
 */
export class CheckoutAttempts {
  private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  private readonly newKey: () => string;
  constructor(
    storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
    newKey: () => string,
  ) {
    this.storage = storage;
    this.newKey = newKey;
  }
  /**
   * The key to send for this order (user + payload); persisted before the request leaves.
   * Only the fingerprint's hash is stored.
   */
  async key(fingerprint: string) {
    const attempt = checkoutAttempt(
      this.storage.getItem(ATTEMPT_SLOT),
      await fingerprintHash(fingerprint),
      this.newKey,
    );
    this.storage.setItem(ATTEMPT_SLOT, JSON.stringify(attempt));
    return attempt.key;
  }
  /** Order created (2xx), cart changed or logout: the next checkout is a new attempt. */
  end() {
    this.storage.removeItem(ATTEMPT_SLOT);
  }
}

// Checkout decisions that do not need Angular: which payment method to send and the
// lifecycle of the Idempotency-Key a confirmation reuses. Unit tested with `node --test` (tests/checkout.test.ts).
import type { PayWith } from "./commerce.service";

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
  /** The key to send for this order (user + payload); persisted before the request leaves. */
  key(fingerprint: string) {
    const attempt = checkoutAttempt(
      this.storage.getItem(ATTEMPT_SLOT),
      fingerprint,
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

// Checkout decisions that do not need Angular: which payment method to send and which
// Idempotency-Key a confirmation reuses. Unit tested with `node --test` (tests/checkout.test.ts).
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

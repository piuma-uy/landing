import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTEMPT_SLOT,
  CheckoutAttempts,
  checkoutAttempt,
  defaultPayWith,
  paymentMethodFor,
} from "../src/app/commerce/checkout.ts";

test("transfer is the default when on, then card, else the unpaid reservation", () => {
  assert.equal(defaultPayWith(true, true), "transfer");
  assert.equal(defaultPayWith(true, false), "transfer");
  assert.equal(defaultPayWith(false, true), "card");
  assert.equal(defaultPayWith(false, false), "pending");
});

test("the order only carries a method the API still offers", () => {
  assert.equal(paymentMethodFor("card", true, true), "card");
  assert.equal(paymentMethodFor("transfer", true, true), "transfer");
  // Switched off between review and confirm: never send a method the shop refused.
  assert.equal(paymentMethodFor("card", true, false), "pending");
  assert.equal(paymentMethodFor("transfer", false, true), "pending");
  assert.equal(paymentMethodFor("pending", true, true), "pending");
});

test("a retry of the same order reuses its Idempotency-Key", () => {
  let n = 0;
  const key = () => "key-" + ++n;
  const first = checkoutAttempt(null, "fp-1", key);
  assert.deepEqual(first, { fingerprint: "fp-1", key: "key-1" });
  // Stored in sessionStorage: a reload or a lost response confirms with the same key.
  const again = checkoutAttempt(JSON.stringify(first), "fp-1", key);
  assert.deepEqual(again, first);
  assert.equal(n, 1);
});

test("a different cart, address or method starts a new attempt", () => {
  const stored = JSON.stringify({ fingerprint: "fp-1", key: "key-old" });
  assert.deepEqual(
    checkoutAttempt(stored, "fp-2", () => "key-new"),
    {
      fingerprint: "fp-2",
      key: "key-new",
    },
  );
});

test("corrupt or incomplete stored attempts are replaced", () => {
  for (const stored of ["{", "null", '"x"', '{"fingerprint":"fp-1"}'])
    assert.equal(checkoutAttempt(stored, "fp-1", () => "fresh").key, "fresh");
});

/** sessionStorage stand-in: a Map behind the three calls the attempts use. */
function memoryStorage() {
  const slots = new Map<string, string>();
  return {
    slots,
    getItem: (k: string) => slots.get(k) ?? null,
    setItem: (k: string, v: string) => void slots.set(k, v),
    removeItem: (k: string) => void slots.delete(k),
  };
}

function attempts() {
  const storage = memoryStorage();
  let n = 0;
  return {
    storage,
    attempts: new CheckoutAttempts(storage, () => "key-" + ++n),
  };
}

test("retries of one attempt keep its key until the result is known", () => {
  const { storage, attempts: a } = attempts();
  // Timeout, 5xx or lost response: the buyer confirms again with the same key.
  assert.equal(a.key("fp-1"), "key-1");
  assert.equal(a.key("fp-1"), "key-1");
  // A reload builds a new service on the same sessionStorage.
  const reloaded = new CheckoutAttempts(storage, () => "other");
  assert.equal(reloaded.key("fp-1"), "key-1");
});

test("after the order is created the same purchase gets a new key (FE-01)", () => {
  const { storage, attempts: a } = attempts();
  assert.equal(a.key("fp-1"), "key-1");
  a.end();
  assert.equal(storage.slots.has(ATTEMPT_SLOT), false);
  // Same user, cart, delivery and phone: a second order, never a replay of the first.
  assert.equal(a.key("fp-1"), "key-2");
});

test("a changed cart or a logout starts a new attempt", () => {
  const { attempts: a } = attempts();
  assert.equal(a.key("fp-1"), "key-1");
  // Different payload: new key even without end().
  assert.equal(a.key("fp-2"), "key-2");
  // Cart saved back to the first content, or logout: end() drops the attempt.
  a.end();
  assert.equal(a.key("fp-1"), "key-3");
});

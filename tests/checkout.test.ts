import { test } from "node:test";
import assert from "node:assert/strict";
import {
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

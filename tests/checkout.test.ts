import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTEMPT_SLOT,
  CheckoutAttempts,
  checkoutAttempt,
  clearSession,
  fingerprintHash,
  defaultPayWith,
  paymentMethodFor,
  deliveryLine,
  stepAfterReview,
  unitsLabel,
} from "../src/app/commerce/checkout.ts";

test("after the review, Entrega opens only when there is something to choose (T72)", () => {
  assert.equal(stepAfterReview({ delivery: { enabled: true } }), "entrega");
  assert.equal(stepAfterReview({ delivery: { enabled: false } }), "pago");
  assert.equal(stepAfterReview(null), "pago");
});

test("the order summary counts units in Spanish (T72)", () => {
  assert.equal(unitsLabel(1), "1 producto");
  assert.equal(unitsLabel(3), "3 productos");
});

test("a finished Entrega reads as one line (T72)", () => {
  assert.equal(
    deliveryLine(
      "Pocitos",
      { street: "Av. Brasil 2550", unit: "Apto 502" },
      "",
    ),
    "Envío a Pocitos · Av. Brasil 2550, Apto 502",
  );
  assert.equal(
    deliveryLine("Carrasco", { street: "", unit: "" }, ""),
    "Envío a Carrasco",
  );
  assert.equal(
    deliveryLine(null, { street: "x", unit: "" }, "Showroom en Pocitos"),
    "Retiro sin costo · Showroom en Pocitos",
  );
  assert.equal(
    deliveryLine(null, { street: "", unit: "" }, " "),
    "Retiro sin costo · Retiro a coordinar",
  );
});

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

test("retries of one attempt keep its key until the result is known", async () => {
  const { storage, attempts: a } = attempts();
  // Timeout, 5xx or lost response: the buyer confirms again with the same key.
  assert.equal(await a.key("fp-1"), "key-1");
  assert.equal(await a.key("fp-1"), "key-1");
  // A reload builds a new service on the same sessionStorage.
  const reloaded = new CheckoutAttempts(storage, () => "other");
  assert.equal(await reloaded.key("fp-1"), "key-1");
});

test("after the order is created the same purchase gets a new key (FE-01)", async () => {
  const { storage, attempts: a } = attempts();
  assert.equal(await a.key("fp-1"), "key-1");
  a.end();
  assert.equal(storage.slots.has(ATTEMPT_SLOT), false);
  // Same user, cart, delivery and phone: a second order, never a replay of the first.
  assert.equal(await a.key("fp-1"), "key-2");
});

test("a changed cart or a logout starts a new attempt", async () => {
  const { attempts: a } = attempts();
  assert.equal(await a.key("fp-1"), "key-1");
  // Different payload: new key even without end().
  assert.equal(await a.key("fp-2"), "key-2");
  // Cart saved back to the first content, or logout: end() drops the attempt.
  a.end();
  assert.equal(await a.key("fp-1"), "key-3");
});

test("only a hash of the fingerprint reaches sessionStorage (FE-06)", async () => {
  const { storage, attempts: a } = attempts();
  const fingerprint = JSON.stringify([
    "user-1",
    { contact: { email: "ana@example.com", phone: "099123456" } },
  ]);
  await a.key(fingerprint);
  const stored = storage.slots.get(ATTEMPT_SLOT)!;
  assert.doesNotMatch(stored, /ana@example\.com|099123456|user-1/);
  assert.equal(
    JSON.parse(stored).fingerprint,
    await fingerprintHash(fingerprint),
  );
  assert.match(await fingerprintHash(fingerprint), /^[0-9a-f]{64}$/);
  // The SHA-256 test vector, so the hash is stable across reloads and browsers.
  assert.equal(
    await fingerprintHash("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("logout drops every piuma-* slot and nothing else (FE-06)", () => {
  const slots = new Map([
    ["piuma-checkout", "{}"],
    ["piuma-switch-abc", "key"],
    ["piuma-payment-return", "abc"],
    ["piuma-oauth", "{}"],
    ["other-app", "kept"],
  ]);
  clearSession({
    get length() {
      return slots.size;
    },
    key: (i: number) => [...slots.keys()][i] ?? null,
    removeItem: (k: string) => void slots.delete(k),
  });
  assert.deepEqual([...slots.keys()], ["other-app"]);
});

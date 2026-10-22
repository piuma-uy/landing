import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CardApi,
  POLL_DELAYS,
  cardOffered,
  checkoutUrl,
  paymentReturn,
  paymentState,
  pollOrder,
  type CardOrder,
} from "../src/app/commerce/card.ts";
import type { PaymentMethods } from "../src/app/commerce/transfer.ts";

const id = "a".repeat(64);
const order = (patch: Partial<CardOrder> = {}): CardOrder => ({
  id,
  status: "pending_payment",
  paymentMethod: "card",
  ...patch,
});
const methods = (card: PaymentMethods["card"]): PaymentMethods => ({
  transfer: { enabled: false, instructions: null, holdHours: null },
  card,
});

test("card is offered only when the API enables Mercado Pago", () => {
  assert.equal(cardOffered(null), false);
  assert.equal(
    cardOffered(
      methods({
        enabled: false,
        provider: null,
        reason: "CARD_PROVIDER_NOT_CONFIGURED",
      }),
    ),
    false,
  );
  assert.equal(
    cardOffered(methods({ enabled: true, provider: null, reason: null })),
    false,
  );
  assert.equal(
    cardOffered(
      methods({ enabled: true, provider: "mercadopago", reason: null }),
    ),
    true,
  );
});

test("return URL: /pago and its aliases with a valid order id", () => {
  const at = (path: string) => paymentReturn(new URL(path, "https://piuma.uy"));
  assert.equal(at(`/pago?order=${id}&result=approved`), id);
  assert.equal(at(`/pago/aprobado?order=${id}`), id);
  assert.equal(at(`/pago/pendiente?order=${id}`), id);
  assert.equal(at(`/pago/rechazado/?order=${id}`), id);
  assert.equal(at(`/pago?result=approved`), null);
  assert.equal(at(`/pago?order=../admin`), null);
  assert.equal(at(`/pago/otra?order=${id}`), null);
  assert.equal(at(`/?order=${id}`), null);
});

test("payment state comes from the order, never from result=approved", () => {
  assert.equal(paymentState(order()), "pending");
  assert.equal(paymentState(order({ cardStatus: "pending" })), "pending");
  assert.equal(paymentState(order({ cardStatus: "failed" })), "failed");
  assert.equal(paymentState(order({ status: "paid" })), "paid");
  assert.equal(paymentState(order({ status: "cancelled" })), "cancelled");
  assert.equal(
    paymentState(
      order({ status: "pending_transfer", paymentMethod: "transfer" }),
    ),
    "transfer",
  );
});

test("only https checkouts (or a local simulator) are followed", () => {
  const url = (redirectUrl: string) =>
    checkoutUrl({ checkoutId: "pref", redirectUrl });
  assert.equal(
    url("https://sandbox.mercadopago.com.uy/checkout/v1/redirect?pref_id=1"),
    "https://sandbox.mercadopago.com.uy/checkout/v1/redirect?pref_id=1",
  );
  assert.equal(
    url("http://localhost:8080/checkout/pref"),
    "http://localhost:8080/checkout/pref",
  );
  assert.equal(url("http://evil.example/checkout"), null);
  assert.equal(url("javascript:alert(1)"), null);
  assert.equal(url("no es una url"), null);
  assert.equal(checkoutUrl(undefined), null);
});

test("polling stops as soon as the webhook settled the order", async () => {
  const answers = [
    order(),
    order({ cardStatus: "pending" }),
    order({ status: "paid" }),
    order({ status: "paid" }),
  ];
  const waits: number[] = [];
  const seen: string[] = [];
  const last = await pollOrder(async () => answers.shift()!, {
    sleep: async (ms) => void waits.push(ms),
    onUpdate: (o) => seen.push(paymentState(o)),
  });
  assert.equal(last.status, "paid");
  assert.deepEqual(seen, ["pending", "pending", "paid"]);
  assert.deepEqual(waits, POLL_DELAYS.slice(1, 3));
});

test("polling stops on a rejected card and gives up after the backoff", async () => {
  const rejected = await pollOrder(
    async () => order({ cardStatus: "failed" }),
    { sleep: async () => {} },
  );
  assert.equal(paymentState(rejected), "failed");
  let calls = 0;
  const waits: number[] = [];
  const pending = await pollOrder(
    async () => {
      calls++;
      return order();
    },
    { sleep: async (ms) => void waits.push(ms) },
  );
  assert.equal(paymentState(pending), "pending");
  assert.equal(calls, POLL_DELAYS.length);
  assert.ok(waits.every((ms, i) => i === 0 || ms >= waits[i - 1]!));
  assert.ok(waits.reduce((s, ms) => s + ms, 0) <= 40_000);
});

test("polling surfaces API errors (404 for someone else's order)", async () => {
  await assert.rejects(
    pollOrder(
      async () => {
        throw new Error("Recurso no encontrado");
      },
      { sleep: async () => {} },
    ),
    /no encontrado/,
  );
});

function cards() {
  const calls: {
    path: string;
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  }[] = [];
  const store = new Map<string, string>();
  let n = 0;
  const api = new CardApi(
    async <T>(
      path: string,
      method?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ) => {
      calls.push({ path, method, body, headers });
      return {} as T;
    },
    {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    },
    () => "key-" + ++n,
  );
  return { api, calls, store };
}

test("checkout asks the API for the order's own preference (no amount sent)", async () => {
  const { api, calls } = cards();
  await api.checkout(id);
  await api.order(id);
  assert.deepEqual(calls, [
    {
      path: `/orders/${id}/payment`,
      method: "POST",
      body: {},
      headers: undefined,
    },
    {
      path: `/orders/${id}`,
      method: undefined,
      body: undefined,
      headers: undefined,
    },
  ]);
});

test("switching to transfer keeps one Idempotency-Key per order across retries", async () => {
  const { api, calls } = cards();
  await api.switchToTransfer(id);
  await api.switchToTransfer(id);
  await api.switchToTransfer("b".repeat(64));
  assert.deepEqual(
    calls.map((c) => [c.path, c.method, c.body, c.headers]),
    [
      [
        `/orders/${id}/payment-method`,
        "POST",
        { paymentMethod: "transfer" },
        { "Idempotency-Key": "key-1" },
      ],
      [
        `/orders/${id}/payment-method`,
        "POST",
        { paymentMethod: "transfer" },
        { "Idempotency-Key": "key-1" },
      ],
      [
        `/orders/${"b".repeat(64)}/payment-method`,
        "POST",
        { paymentMethod: "transfer" },
        { "Idempotency-Key": "key-2" },
      ],
    ],
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHOOSE_PAYMENT,
  INVALID_ORDER_STATE,
  PAYMENT_IN_PROGRESS,
  buyerCancellable,
  cancelErrorMessage,
  OPEN_ORDERS_LIMIT,
  ORDERS_LINK_CODES,
  TOO_MANY_OPEN_ORDERS,
  checkoutLimitMessage,
  dateTime,
  deadline,
  reservedUntil,
} from "../src/app/commerce/orders.ts";

test("dates show in Montevideo time whatever the device zone", () => {
  assert.equal(dateTime("2026-10-24T15:00:00.000Z"), "24/10/2026 12:00");
  assert.equal(
    dateTime("2026-10-24T15:00:00.000Z", true),
    "24/10/2026 a las 12:00",
  );
  // 02:30 UTC is still the previous day in Uruguay (UTC-3), with a 24-hour clock.
  assert.equal(dateTime("2026-10-25T02:30:00.000Z"), "24/10/2026 23:30");
  assert.equal(dateTime("2026-01-05T03:05:00.000Z"), "05/01/2026 00:05");
});

test("missing or broken dates render nothing", () => {
  assert.equal(dateTime(undefined), "");
  assert.equal(dateTime(null, true), "");
  assert.equal(dateTime("not a date"), "");
});

test("each unpaid order is reserved until its own deadline", () => {
  assert.equal(
    reservedUntil({
      status: "pending_transfer",
      transfer: { expiresAt: "2026-10-25T15:00:00.000Z" },
    }),
    "2026-10-25T15:00:00.000Z",
  );
  assert.equal(
    reservedUntil({
      status: "pending_payment",
      cardExpiresAt: "2026-10-24T15:00:00.000Z",
    }),
    "2026-10-24T15:00:00.000Z",
  );
  assert.equal(
    reservedUntil({
      status: "pending_payment",
      pendingExpiresAt: "2026-10-26T15:00:00.000Z",
    }),
    "2026-10-26T15:00:00.000Z",
  );
});

test("paid, cancelled and pre-T52 orders show no reservation", () => {
  const deadline = { pendingExpiresAt: "2026-10-26T15:00:00.000Z" };
  assert.equal(reservedUntil({ status: "paid", ...deadline }), null);
  assert.equal(reservedUntil({ status: "cancelled", ...deadline }), null);
  assert.equal(reservedUntil({ status: "pending_payment" }), null);
});

test("the open-orders limit tells the buyer how to continue", () => {
  assert.equal(TOO_MANY_OPEN_ORDERS, "TOO_MANY_OPEN_ORDERS");
  assert.match(OPEN_ORDERS_LIMIT, /pagá o cancelá uno de tus pedidos/);
  assert.match(OPEN_ORDERS_LIMIT, /venza su reserva/);
});

test("each reservation limit of POST /orders gets its own way out", () => {
  assert.equal(
    checkoutLimitMessage("TOO_MANY_OPEN_ORDERS", "api text"),
    OPEN_ORDERS_LIMIT,
  );
  // RESERVATION_LIMIT keeps the API text: it carries the limits in force.
  const api =
    "Podés reservar hasta 10 unidades en total y 5 por producto entre tus pedidos sin pagar; pagá o cancelá uno, o comprá menos unidades";
  assert.equal(checkoutLimitMessage("RESERVATION_LIMIT", api), api + ".");
  assert.equal(checkoutLimitMessage("RESERVATION_LIMIT", "Listo."), "Listo.");
  assert.equal(
    checkoutLimitMessage("PAYMENT_METHOD_REQUIRED", "api text"),
    CHOOSE_PAYMENT,
  );
  assert.equal(checkoutLimitMessage("OUT_OF_STOCK", "api text"), null);
  assert.equal(checkoutLimitMessage(undefined, "api text"), null);
  assert.deepEqual(ORDERS_LINK_CODES, [
    "TOO_MANY_OPEN_ORDERS",
    "RESERVATION_LIMIT",
  ]);
});

test("only unpaid orders offer the buyer's cancellation (R5)", () => {
  assert.equal(buyerCancellable({ status: "pending_payment" }), true);
  assert.equal(buyerCancellable({ status: "pending_transfer" }), true);
  assert.equal(buyerCancellable({ status: "paid" }), false);
  assert.equal(buyerCancellable({ status: "cancelled" }), false);
});

test("cancellation refusals explain what happened (R5)", () => {
  assert.match(cancelErrorMessage(PAYMENT_IN_PROGRESS)!, /procesando un pago/);
  assert.match(
    cancelErrorMessage(INVALID_ORDER_STATE)!,
    /ya no se puede cancelar/,
  );
  // Anything else keeps the API message (404, 502/503 of the provider…).
  assert.equal(cancelErrorMessage("NOT_FOUND"), null);
  assert.equal(cancelErrorMessage(undefined), null);
});

test("deadlines name the weekday, in Montevideo time", () => {
  assert.equal(
    deadline("2026-10-28T21:58:00.000Z"),
    "miércoles 28/10 a las 18:58",
  );
  assert.equal(
    deadline("2026-10-27T03:30:00.000Z"),
    "martes 27/10 a las 00:30",
  );
  assert.equal(deadline(undefined), "");
  assert.equal(deadline("no-date"), "");
});

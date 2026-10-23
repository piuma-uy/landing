import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OPEN_ORDERS_LIMIT,
  TOO_MANY_OPEN_ORDERS,
  dateTime,
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
  assert.match(OPEN_ORDERS_LIMIT, /pagá uno de tus pedidos/);
  assert.match(OPEN_ORDERS_LIMIT, /venza su reserva/);
});

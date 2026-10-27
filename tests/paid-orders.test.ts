import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paidOrderSummary,
  unitsSold,
} from "../src/app/commerce/paid-orders.ts";

const order = (
  id: string,
  paidAt: string | undefined,
  quantities: number[],
) => ({
  id,
  paidAt,
  createdAt: "2026-10-01T12:00:00.000Z",
  paymentMethod: "transfer",
  items: quantities.map((quantity) => ({ quantity })),
});

test("one order of two different pillows is one row: two products, three units", () => {
  assert.equal(
    paidOrderSummary(order("a", "2026-10-26T12:00:00.000Z", [1, 2])),
    "2 productos · 3 unidades · Transferencia",
  );
  assert.equal(
    paidOrderSummary({
      ...order("b", undefined, [1]),
      paymentMethod: "card",
    }),
    "1 producto · 1 unidad · Tarjeta",
  );
});

test("units sold add every month", () => {
  assert.equal(unitsSold([{ unitsSold: 3 }, { unitsSold: 4 }]), 7);
  assert.equal(unitsSold([]), 0);
});

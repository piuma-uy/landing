import { test } from "node:test";
import assert from "node:assert/strict";
import { orderProgress } from "../src/app/commerce/order-progress.ts";
import { statusLabel } from "../src/app/commerce/transfer.ts";

const states = (o: { status: string; cancelledBy?: string; shipping?: { method: string } }) =>
  orderProgress(o, statusLabel(o)).map((s) => `${s.label}:${s.state}`);

test("unpaid order: waiting for the payment, handover still ahead", () => {
  assert.deepEqual(states({ status: "pending_transfer" }), [
    "Pedido recibido:done",
    "Esperando la transferencia:current",
    "Retiro a coordinar:todo",
  ]);
  assert.deepEqual(states({ status: "pending_payment", shipping: { method: "delivery" } }), [
    "Pedido recibido:done",
    "Esperando el pago:current",
    "Entrega a coordinar:todo",
  ]);
});

test("paid order: the handover is the current step, never shown as done", () => {
  assert.deepEqual(states({ status: "paid", shipping: { method: "pickup" } }), [
    "Pedido recibido:done",
    "Pago confirmado:done",
    "Retiro a coordinar:current",
  ]);
});

test("cancelled order ends with its own label (expired reservations say Vencido)", () => {
  assert.deepEqual(states({ status: "cancelled", cancelledBy: "user-1" }), [
    "Pedido recibido:done",
    "Cancelado:cancelled",
  ]);
  assert.deepEqual(states({ status: "cancelled", cancelledBy: "system:card-expiry" }), [
    "Pedido recibido:done",
    "Vencido:cancelled",
  ]);
});

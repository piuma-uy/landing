// "Mis pedidos" as a short timeline (T69): received → paid → pickup/delivery. The API tracks
// payment, not the delivery itself, so the last step is never shown as done.
// Framework-free so node --test can load it. Imports nothing from the shop on purpose: it runs in
// a deferred chunk, and a shared module would split the initial bundle in several files.

export type StepState = "done" | "current" | "todo" | "cancelled";
export interface ProgressStep {
  label: string;
  state: StepState;
}

interface ProgressOrder {
  status: string;
  shipping?: { method: string } | null;
}

/** `statusText` is the order's label ("Cancelado", "Vencido"…), used as the last cancelled step. */
export function orderProgress(order: ProgressOrder, statusText: string): ProgressStep[] {
  const received: ProgressStep = { label: "Pedido recibido", state: "done" };
  if (order.status === "cancelled")
    return [received, { label: statusText, state: "cancelled" }];
  const paid = order.status === "paid";
  const handover =
    order.shipping?.method === "delivery" ? "Entrega a coordinar" : "Retiro a coordinar";
  return [
    received,
    {
      label: paid
        ? "Pago confirmado"
        : order.status === "pending_transfer"
          ? "Esperando la transferencia"
          : "Esperando el pago",
      state: paid ? "done" : "current",
    },
    { label: handover, state: paid ? "current" : "todo" },
  ];
}

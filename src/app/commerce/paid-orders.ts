// "Pedidos pagados" del Resumen (T76): la lista de lo que cuentan las métricas, un pedido por fila
// aunque tenga varios productos o unidades.
export interface PaidOrder {
  paymentMethod: string;
  items: { quantity: number }[];
}

/** Paid orders shown at first; the rest behind "Ver más pedidos pagados". */
export const PAID_PREVIEW = 5;

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** "2 productos · 3 unidades · Transferencia". */
export function paidOrderSummary(order: PaidOrder) {
  const units = order.items.reduce((s, i) => s + i.quantity, 0);
  return [
    plural(order.items.length, "producto", "productos"),
    plural(units, "unidad", "unidades"),
    order.paymentMethod === "card" ? "Tarjeta" : "Transferencia",
  ].join(" · ");
}

/** The units of every month of /admin/metrics. */
export const unitsSold = (metrics: { unitsSold: number }[]) =>
  metrics.reduce((s, m) => s + m.unitsSold, 0);

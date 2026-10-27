import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  CONFIRMATION_PROMISE,
  EXPIRY_PRINCIPAL,
  TransferApi,
  orderCode,
  orderZone,
  phoneCounts,
  phoneKey,
  phoneReference,
  reservationText,
  transferSearch,
  settingsInput,
  statusLabel,
  transferOffered,
  type OrderTransfer,
  type PaymentMethods,
  type Settings,
} from "../src/app/commerce/transfer.ts";

const instructions = {
  bank: "Banco de ejemplo",
  accountType: "Caja de ahorro",
  accountNumber: "000-0000000",
  holder: "Piuma SAS",
  currency: "UYU",
  note: "",
};
const transfer: OrderTransfer = {
  instructions,
  amountMinor: 300050,
  currency: "UYU",
  reference: "ABCD1234",
  expiresAt: "2026-10-24T15:00:00.000Z",
  whatsappUrl: "https://wa.me/59899000000?text=Hola%20Piuma",
};
const order = {
  id: "abcd1234-0000",
  status: "pending_transfer",
  totalMinor: 300050,
  currency: "UYU",
  paymentMethod: "transfer",
  transfer,
};
const settings: Settings = {
  transfer: { enabled: true, instructions, holdHours: 48 },
  card: { holdHours: 24 },
  orders: { maxOpenPerUser: 3, pendingHoldHours: 48 },
  contact: { whatsappNumber: "+59899000000" },
  notifications: { whatsappEnabled: true, shopEmail: "hola@piuma.uy" },
  shipping: {
    pickup: { enabled: true, details: "" },
    delivery: { enabled: false, zones: [], freeFromMinor: null },
  },
  version: 3,
  updatedAt: "2026-10-22T15:00:00.000Z",
  updatedBy: "admin",
};

/** Fake request: records calls and answers from a queue (Error instances are thrown). */
function api(...responses: unknown[]) {
  const calls: { path: string; method?: string; body?: unknown }[] = [];
  const client = new TransferApi(
    async <T>(path: string, method?: string, body?: unknown) => {
      calls.push({ path, method, body });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next as T;
    },
  );
  return { client, calls };
}

test("transfer is offered only when the API enables it with instructions", () => {
  const methods = (
    enabled: boolean,
    withInstructions = true,
  ): PaymentMethods => ({
    transfer: {
      enabled,
      instructions: withInstructions ? instructions : null,
      holdHours: enabled ? 48 : null,
    },
    card: { enabled: false, reason: "CARD_PROVIDER_NOT_CONFIGURED" },
  });
  assert.equal(transferOffered(methods(true)), true);
  assert.equal(transferOffered(methods(false)), false);
  assert.equal(transferOffered(methods(true, false)), false);
  assert.equal(transferOffered(null), false);
});

test("status labels distinguish expired transfers from manual cancellations", () => {
  assert.equal(
    statusLabel({ status: "pending_transfer" }),
    "Pendiente de transferencia",
  );
  assert.equal(statusLabel({ status: "paid" }), "Pagado");
  assert.equal(
    statusLabel({ status: "cancelled", cancelledBy: EXPIRY_PRINCIPAL }),
    "Vencido",
  );
  // The same hourly job also expires card orders and orders without payment method (T52-H1).
  for (const cancelledBy of ["system:card-expiry", "system:pending-expiry"])
    assert.equal(statusLabel({ status: "cancelled", cancelledBy }), "Vencido");
  assert.equal(
    statusLabel({ status: "cancelled", cancelledBy: "admin-sub" }),
    "Cancelado",
  );
  assert.equal(statusLabel({ status: "pending_payment" }), "Pendiente de pago");
});

test("settings body is a versioned full replacement with blanks as null", () => {
  const body = settingsInput({
    ...settings,
    transfer: {
      ...settings.transfer,
      instructions: { ...instructions, bank: "  Banco  " },
    },
    contact: { whatsappNumber: "  " },
    notifications: { whatsappEnabled: false, shopEmail: "" },
  });
  assert.deepEqual(body, {
    transfer: {
      enabled: true,
      instructions: { ...instructions, bank: "Banco" },
      holdHours: 48,
    },
    card: { holdHours: 24 },
    orders: { maxOpenPerUser: 3, pendingHoldHours: 48 },
    contact: { whatsappNumber: null },
    notifications: { whatsappEnabled: false, shopEmail: null },
    shipping: settings.shipping,
    expectedVersion: 3,
  });
  assert.equal("version" in body, false);
  assert.equal("updatedAt" in body, false);
});

test("pending transfers follow every page of the status filter", async () => {
  const { client, calls } = api(
    { items: [order], nextCursor: "c/1" },
    { items: [{ ...order, id: "second" }] },
  );
  const rows = await client.pending();
  assert.deepEqual(
    rows.map((o) => o.id),
    ["abcd1234-0000", "second"],
  );
  assert.deepEqual(
    calls.map((c) => c.path),
    [
      "/admin/orders?status=pending_transfer",
      "/admin/orders?status=pending_transfer&cursor=c%2F1",
    ],
  );
});

test("confirm sends the bank reference with the transfer amount and currency", async () => {
  const { client, calls } = api({ ...order, status: "paid" });
  const paid = await client.confirm(order, "  BANK-77 ");
  assert.equal(paid.status, "paid");
  assert.deepEqual(calls, [
    {
      path: "/admin/orders/abcd1234-0000/confirm-transfer",
      method: "POST",
      body: { bankReference: "BANK-77", amountMinor: 300050, currency: "UYU" },
    },
  ]);
});

test("confirm without a bank reference leaves it out (optional, T74)", async () => {
  for (const blank of [undefined, "", "   "]) {
    const { client, calls } = api({ ...order, status: "paid" });
    await client.confirm(order, blank);
    assert.deepEqual(calls[0]!.body, { amountMinor: 300050, currency: "UYU" });
  }
});

test("the confirmation dialog names the zone, or pickup (T74)", () => {
  assert.equal(
    orderZone({
      method: "delivery",
      zoneId: "mvd",
      zoneName: "Interior (a coordinar)",
      leadTime: "",
      priceMinor: 0,
      freeShipping: false,
    }),
    "Interior",
  );
  assert.equal(
    orderZone({ method: "pickup", priceMinor: 0, details: "" }),
    "Retiro a coordinar",
  );
  assert.equal(
    orderZone({ method: "pickup", priceMinor: 0, details: "Pocitos, de tarde" }),
    "Retiro: Pocitos, de tarde",
  );
  assert.equal(orderZone(undefined), "Retiro a coordinar");
});

test("cancel posts the trimmed reason", async () => {
  const { client, calls } = api({ ...order, status: "cancelled" });
  await client.cancel(order, " Transferencia no recibida ");
  assert.deepEqual(calls[0], {
    path: "/admin/orders/abcd1234-0000/cancel",
    method: "POST",
    body: { reason: "Transferencia no recibida" },
  });
});

test("saving settings returns the stored copy", async () => {
  const saved = { ...settings, version: 4 };
  const { client, calls } = api(saved);
  assert.deepEqual(await client.saveSettings(settings), {
    settings: saved,
    conflict: false,
  });
  assert.equal(calls[0]!.method, "PUT");
  assert.equal(
    (calls[0]!.body as { expectedVersion: number }).expectedVersion,
    3,
  );
});

test("a 409 on save reloads the current settings instead of overwriting them", async () => {
  const current = {
    ...settings,
    version: 5,
    contact: { whatsappNumber: "+59891111111" },
  };
  const { client, calls } = api(
    new ApiError("Otro cambio", 409, "VERSION_CONFLICT"),
    current,
  );
  assert.deepEqual(await client.saveSettings(settings), {
    settings: current,
    conflict: true,
  });
  assert.deepEqual(
    calls.map((c) => [c.method ?? "GET", c.path]),
    [
      ["PUT", "/admin/settings"],
      ["GET", "/admin/settings"],
    ],
  );
});

test("other save errors propagate untouched", async () => {
  const { client, calls } = api(
    new ApiError("Completá datos bancarios", 400, "VALIDATION_ERROR"),
  );
  await assert.rejects(client.saveSettings(settings), { status: 400 });
  assert.equal(calls.length, 1);
});

test("payment methods come from the API", async () => {
  const { client, calls } = api({
    transfer: { enabled: false },
    card: { enabled: false },
  });
  await client.paymentMethods();
  assert.equal(calls[0]!.path, "/payment-methods");
});

test("unit limits go in the settings body only when the API sent them", () => {
  const withUnits = settingsInput({
    ...settings,
    orders: {
      maxOpenPerUser: 2,
      maxUnitsPerUser: 12,
      maxUnitsPerSku: 4,
      pendingHoldHours: 24,
    },
  });
  assert.deepEqual(withUnits.orders, {
    maxOpenPerUser: 2,
    maxUnitsPerUser: 12,
    maxUnitsPerSku: 4,
    pendingHoldHours: 24,
  });
  // An API without them (pre T52-R1) keeps the saved values.
  assert.deepEqual(settingsInput(settings).orders, {
    maxOpenPerUser: 3,
    pendingHoldHours: 48,
  });
});

test("pending transfers carry the search by phone or name to every page (T70)", async () => {
  const { client, calls } = api(
    { items: [order], nextCursor: "c/1" },
    { items: [] },
    { items: [order] },
  );
  await client.pending({ phone: "+598 91 813 234" });
  await client.pending({ name: "José Pérez" });
  assert.deepEqual(
    calls.map((c) => c.path),
    [
      "/admin/orders?status=pending_transfer&phone=%2B598%2091%20813%20234",
      "/admin/orders?status=pending_transfer&phone=%2B598%2091%20813%20234&cursor=c%2F1",
      "/admin/orders?status=pending_transfer&name=Jos%C3%A9%20P%C3%A9rez",
    ],
  );
});

test("the search box: digits search by phone, words by name, too short is null", () => {
  assert.deepEqual(transferSearch(" 091 813 234 "), { phone: "091 813 234" });
  assert.deepEqual(transferSearch("+598 91813234"), { phone: "+598 91813234" });
  assert.deepEqual(transferSearch("3234"), { phone: "3234" });
  assert.deepEqual(transferSearch("Ana"), { name: "Ana" });
  assert.deepEqual(transferSearch("ana 099"), { name: "ana 099" });
  assert.equal(transferSearch("091"), null);
  assert.equal(transferSearch("a"), null);
  assert.equal(transferSearch("   "), null);
});

test("several pending orders of one phone are counted whatever its prefix", () => {
  const counts = phoneCounts([
    { contact: { phone: "091 813 234" } },
    { contact: { phone: "+598 91 813 234" } },
    { contact: { phone: "91813234" } },
    { contact: { phone: "099 000 111" } },
    {},
  ]);
  assert.equal(counts.get(phoneKey("091813234")), 3);
  assert.equal(counts.get(phoneKey("099000111")), 1);
  assert.equal(counts.size, 2);
});

test("transfer screen texts: hours, Uruguay time, phone reference and the promise", () => {
  const t = { ...transfer, expiresAt: "2026-10-28T21:58:00.000Z" };
  assert.equal(
    reservationText({ ...t, holdHours: 48 }),
    "Te reservamos los productos por 48 horas, hasta el miércoles 28/10 a las 18:58 (hora de Uruguay).",
  );
  assert.equal(
    reservationText({ ...t, holdHours: 1 }),
    "Te reservamos los productos por 1 hora, hasta el miércoles 28/10 a las 18:58 (hora de Uruguay).",
  );
  // Orders from before T70 do not say how many hours.
  assert.equal(
    reservationText(t),
    "Te reservamos los productos hasta el miércoles 28/10 a las 18:58 (hora de Uruguay).",
  );
  assert.equal(phoneReference({ referenceType: "phone" }), true);
  assert.equal(phoneReference({ referenceType: "order" }), false);
  assert.equal(phoneReference({}), false);
  assert.equal(orderCode({ id: "abcd1234ffff" }), "ABCD1234");
  assert.match(CONFIRMATION_PROMISE, /por mail y por teléfono/);
});

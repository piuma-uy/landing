import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PICKUP_FALLBACK,
  choices,
  defaultChoice,
  orderFulfillment,
  pickupLabel,
  quoteBody,
  shippingInput,
  shippingProblem,
  shippingSummary,
  toMinor,
  zoneId,
  type ShippingOptions,
  type ShippingSettings,
} from "../src/app/commerce/shipping.ts";
import { settingsInput, type Settings } from "../src/app/commerce/transfer.ts";

const items = [{ sku: "sabanas-twin-beige", quantity: 2 }];
/** What GET /shipping-options returns before an administrator saves a policy. */
const unset: ShippingOptions = {
  pickup: { enabled: true, details: "" },
  delivery: { enabled: false, zones: [], freeFromMinor: null },
  currency: "UYU",
};
const configured: ShippingOptions = {
  pickup: { enabled: true, details: "Retiro en el taller, coordinar antes" },
  delivery: {
    enabled: true,
    zones: [
      {
        id: "montevideo",
        name: "Montevideo",
        priceMinor: 25000,
        leadTime: "24 h",
      },
      { id: "interior", name: "Interior", priceMinor: 40000, leadTime: "72 h" },
    ],
    freeFromMinor: 500000,
  },
  currency: "UYU",
};

test("without a saved policy only pickup by arrangement is offered", () => {
  assert.deepEqual(choices(unset), [{ method: "pickup" }]);
  assert.deepEqual(defaultChoice(unset), { method: "pickup" });
  assert.equal(pickupLabel(unset.pickup.details), PICKUP_FALLBACK);
  assert.equal(pickupLabel("  "), "Retiro a coordinar");
  assert.equal(
    pickupLabel(configured.pickup.details),
    configured.pickup.details,
  );
  assert.deepEqual(choices(null), []);
  assert.equal(defaultChoice(null), null);
});

test("choices list pickup and every zone; the current one is kept while offered", () => {
  assert.deepEqual(choices(configured), [
    { method: "pickup" },
    { method: "delivery", zoneId: "montevideo" },
    { method: "delivery", zoneId: "interior" },
  ]);
  const interior = { method: "delivery" as const, zoneId: "interior" };
  assert.deepEqual(defaultChoice(configured, interior), interior);
  // Zone withdrawn: back to the first option instead of a stale choice.
  assert.deepEqual(
    defaultChoice(configured, { method: "delivery", zoneId: "gone" }),
    {
      method: "pickup",
    },
  );
  const deliveryOnly = {
    ...configured,
    pickup: { enabled: false, details: "" },
  };
  assert.deepEqual(defaultChoice(deliveryOnly), {
    method: "delivery",
    zoneId: "montevideo",
  });
  // Pickup chosen but now off: first zone.
  assert.deepEqual(defaultChoice(deliveryOnly, { method: "pickup" }), {
    method: "delivery",
    zoneId: "montevideo",
  });
});

test("quote and order bodies carry the choice, never a shipping price", () => {
  assert.deepEqual(quoteBody(items, null), { items });
  assert.deepEqual(quoteBody(items, { method: "pickup" }), {
    items,
    fulfillment: "pickup",
  });
  assert.deepEqual(
    quoteBody(items, { method: "delivery", zoneId: "interior" }),
    {
      items,
      fulfillment: "delivery",
      zoneId: "interior",
    },
  );
  const address = {
    street: " Av. Siempreviva 742 ",
    city: " Pocitos ",
    department: "Montevideo",
    notes: "  ",
  };
  assert.deepEqual(orderFulfillment({ method: "pickup" }, address), {
    fulfillment: "pickup",
  });
  const delivery = orderFulfillment(
    { method: "delivery", zoneId: "montevideo" },
    address,
  );
  assert.deepEqual(delivery, {
    fulfillment: "delivery",
    delivery: {
      zoneId: "montevideo",
      address: {
        street: "Av. Siempreviva 742",
        city: "Pocitos",
        department: "Montevideo",
      },
    },
  });
  assert.equal(
    orderFulfillment(
      { method: "delivery", zoneId: "montevideo" },
      { ...address, notes: " Apto 2 " },
    ).delivery?.address.notes,
    "Apto 2",
  );
  for (const body of [
    quoteBody(items, { method: "delivery", zoneId: "x" }),
    delivery,
  ])
    assert.doesNotMatch(
      JSON.stringify(body),
      /priceMinor|totalMinor|freeShipping/,
    );
});

test("order snapshot summary for buyer, admin and orders from before shipping", () => {
  assert.equal(shippingSummary(undefined), "Retiro a coordinar");
  assert.equal(
    shippingSummary({ method: "pickup", priceMinor: 0, details: "" }),
    "Retiro a coordinar",
  );
  assert.equal(
    shippingSummary({
      method: "pickup",
      priceMinor: 0,
      details: "En el taller",
    }),
    "Retiro: En el taller",
  );
  const shipped = {
    method: "delivery" as const,
    zoneId: "montevideo",
    zoneName: "Montevideo",
    leadTime: "24 h",
    priceMinor: 0,
    freeShipping: true,
    address: {
      street: "Rambla 1",
      city: "Pocitos",
      department: "Montevideo",
      notes: "Portería",
    },
  };
  assert.equal(
    shippingSummary(shipped),
    "Envío a Montevideo · Rambla 1, Pocitos, Montevideo · 24 h",
  );
  assert.equal(
    shippingSummary(shipped, true),
    "Envío a Montevideo · Rambla 1, Pocitos, Montevideo (Portería) · 24 h",
  );
});

test("zone ids are slugs of the name, unique, and existing ids are kept", () => {
  assert.equal(zoneId("Paysandú y Río Negro", []), "paysandu-y-rio-negro");
  assert.equal(zoneId("Montevideo", ["montevideo"]), "montevideo-2");
  assert.equal(
    zoneId("Montevideo", ["montevideo", "montevideo-2"]),
    "montevideo-3",
  );
  assert.equal(zoneId("¡¡!!", []), "zona");
  assert.match(zoneId("x".repeat(80), []), /^[a-z0-9-]{1,40}$/);
  const draft: ShippingSettings = {
    pickup: { enabled: true, details: "  En el taller " },
    delivery: {
      enabled: true,
      zones: [
        {
          id: "montevideo",
          name: " Montevideo centro ",
          priceMinor: 25000,
          leadTime: " 24 h ",
        },
        { id: "", name: "Montevideo", priceMinor: 30000, leadTime: "" },
        { id: "", name: "Canelones", priceMinor: 35000, leadTime: "48 h" },
      ],
      freeFromMinor: 0,
    },
  };
  assert.deepEqual(shippingInput(draft), {
    pickup: { enabled: true, details: "En el taller" },
    delivery: {
      enabled: true,
      zones: [
        {
          id: "montevideo",
          name: "Montevideo centro",
          priceMinor: 25000,
          leadTime: "24 h",
        },
        {
          id: "montevideo-2",
          name: "Montevideo",
          priceMinor: 30000,
          leadTime: "",
        },
        {
          id: "canelones",
          name: "Canelones",
          priceMinor: 35000,
          leadTime: "48 h",
        },
      ],
      freeFromMinor: null,
    },
  });
});

test("pesos typed in the panel become minor units", () => {
  assert.equal(toMinor(250), 25000);
  assert.equal(toMinor("250.5"), 25050);
  assert.equal(toMinor(0.1 + 0.2), 30);
  assert.equal(toMinor(""), null);
  assert.equal(toMinor(null), null);
  assert.equal(toMinor(-1), null);
  assert.equal(toMinor("abc"), null);
});

test("the panel cannot save a shipping policy the API would reject", () => {
  const ok = configured;
  assert.equal(shippingProblem(ok), "");
  assert.match(
    shippingProblem({
      ...ok,
      pickup: { enabled: false, details: "" },
      delivery: { ...ok.delivery, enabled: false },
    }),
    /retiro o el envío/,
  );
  assert.match(
    shippingProblem({
      ...ok,
      delivery: { enabled: true, zones: [], freeFromMinor: null },
    }),
    /al menos una zona/,
  );
});

test("settings PUT body sends shipping with expectedVersion, and omits it when absent", () => {
  const base = {
    transfer: {
      enabled: false,
      instructions: {
        bank: "",
        accountType: "",
        accountNumber: "",
        holder: "",
        currency: "",
        note: "",
      },
      holdHours: 48,
    },
    contact: { whatsappNumber: null },
    notifications: { whatsappEnabled: true, shopEmail: null },
    version: 4,
    updatedAt: null,
    updatedBy: null,
  };
  const shipping = shippingInput(configured);
  const body = settingsInput({ ...base, shipping } as Settings);
  assert.deepEqual(body.shipping, shipping);
  assert.equal(body.expectedVersion, 4);
  assert.equal("shipping" in settingsInput(base as unknown as Settings), false);
});

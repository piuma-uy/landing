import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_POLICY,
  isShippingPath,
  policySections,
  policyTeaser,
  shippingPolicy,
} from "../src/app/core/shipping-policy.ts";
import type { ShippingOptions } from "../src/app/commerce/shipping.ts";

const options: ShippingOptions = {
  pickup: { enabled: true, details: " En el taller " },
  delivery: {
    enabled: true,
    zones: [
      { id: "a", name: "Pocitos", priceMinor: 0, leadTime: "24 a 72 h", pricing: "fixed" },
      { id: "b", name: "Centro", priceMinor: 25000, leadTime: "24 a 72 h", pricing: "fixed" },
      { id: "c", name: "Otra zona / interior (a coordinar)", priceMinor: 0, leadTime: "5 días", pricing: "coordinate" },
    ],
    freeFromMinor: 500000,
  },
  currency: "UYU",
};

test("without a saved policy (or API) the page shows Piuma's own (T68)", () => {
  assert.equal(shippingPolicy(null), FALLBACK_POLICY);
  const unset: ShippingOptions = {
    pickup: { enabled: true, details: "" },
    delivery: { enabled: false, zones: [], freeFromMinor: null },
    currency: "UYU",
  };
  assert.equal(shippingPolicy(unset), FALLBACK_POLICY);
  assert.equal(policyTeaser(FALLBACK_POLICY), "Envío gratis en Carrasco, Pocitos y más");
});

test("the policy follows GET /shipping-options (T68)", () => {
  const policy = shippingPolicy(options);
  assert.equal(policy.leadTime, "24 a 72 h");
  assert.deepEqual(policy.freeZones, ["Pocitos"]);
  assert.equal(policy.paidZones[0].name, "Centro");
  assert.match(policy.paidZones[0].price, /250/);
  assert.equal(policy.coordinate, true);
  assert.equal(policy.pickup, "En el taller");
  assert.match(policy.freeFrom!, /5\.000/);
  assert.equal(policyTeaser(policy), "Envío gratis en Pocitos");
  assert.deepEqual(
    policySections(policy).map((s) => s.title),
    ["Cuánto tarda", "Envío gratis", "Con costo de envío", "Resto de Montevideo e interior", "Compras grandes", "Retiro", "Cómo sigue"],
  );
  // Piuma's: no pickup section, free zones listed, the rest by WhatsApp with an agency.
  const sections = policySections(FALLBACK_POLICY);
  assert.equal(sections.some((s) => s.title === "Retiro"), false);
  assert.match(sections.find((s) => s.title.startsWith("Resto"))!.text, /tipo DAC/);
  assert.equal(policyTeaser({ ...FALLBACK_POLICY, freeZones: ["A", "B"] }), "Envío gratis en A y B");
});

test("/envios/ with or without the trailing slash", () => {
  assert.equal(isShippingPath("/envios/"), true);
  assert.equal(isShippingPath("/envios"), true);
  assert.equal(isShippingPath("/envios/x"), false);
  assert.equal(isShippingPath("/"), false);
});

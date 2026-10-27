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
      { id: "a", name: "Pocitos", priceMinor: 0, leadTime: "24 a 72 h", pricing: "fixed", department: "Montevideo", places: ["Pocitos"] },
      { id: "b", name: "Centro", priceMinor: 25000, leadTime: "24 a 72 h", pricing: "fixed", department: "Montevideo", places: ["Centro"] },
      { id: "c", name: "Otra zona / interior (a coordinar)", priceMinor: 0, leadTime: "5 días", pricing: "coordinate", department: null, places: [] },
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
  assert.deepEqual(policy.freeAreas, ["Montevideo: Pocitos"]);
  assert.equal(policy.paidZones[0].name, "Centro (Montevideo)");
  assert.match(policy.paidZones[0].price, /250/);
  assert.equal(policy.coordinate, true);
  assert.equal(policy.pickup, "En el taller");
  assert.match(policy.freeFrom!, /5\.000/);
  assert.equal(policyTeaser(policy), "Envío gratis en Pocitos");
  assert.deepEqual(
    policySections(policy).map((s) => s.title),
    ["Cuánto tarda", "Envío gratis", "Con costo de envío", "Resto de Montevideo e interior", "Tu dirección", "Compras grandes", "Retiro", "Cómo sigue"],
  );
  // Piuma's: no pickup section, free zones listed, the rest by WhatsApp with an agency.
  const sections = policySections(FALLBACK_POLICY);
  assert.equal(sections.some((s) => s.title === "Retiro"), false);
  assert.match(sections.find((s) => s.title.startsWith("Resto"))!.text, /tipo DAC/);
  assert.match(sections.find((s) => s.title.startsWith("Resto"))!.text, /18 departamentos del interior/);
  // T73: the free zones by department, and how the zone decides the address.
  assert.deepEqual(sections.find((s) => s.title === "Envío gratis")!.items, [
    "Montevideo: Carrasco, Pocitos, Punta Carretas y Ciudad Vieja",
    "Canelones: Ciudad de la Costa",
  ]);
  assert.match(
    sections.find((s) => s.title === "Tu dirección")!.text,
    /define el departamento y, en las zonas gratis, también el barrio\. Para otro barrio de Montevideo lo elegís de la lista/,
  );
  assert.equal(policyTeaser({ ...FALLBACK_POLICY, freeZones: ["A", "B"] }), "Envío gratis en A y B");
});

test("/envios/ with or without the trailing slash", () => {
  assert.equal(isShippingPath("/envios/"), true);
  assert.equal(isShippingPath("/envios"), true);
  assert.equal(isShippingPath("/envios/x"), false);
  assert.equal(isShippingPath("/"), false);
});

test("free zones by department, as GET /shipping-options declares them (T73)", () => {
  const policy = shippingPolicy({
    ...options,
    delivery: {
      ...options.delivery,
      zones: [
        { id: "a", name: "Carrasco", priceMinor: 0, leadTime: "", pricing: "fixed", department: "Montevideo", places: ["Carrasco"] },
        { id: "b", name: "Ciudad de la Costa", priceMinor: 0, leadTime: "", pricing: "fixed", department: "Canelones", places: ["Ciudad de la Costa"] },
        { id: "c", name: "Pocitos", priceMinor: 0, leadTime: "", pricing: "fixed", department: "Montevideo", places: ["Pocitos"] },
        { id: "d", name: "Maldonado", priceMinor: 0, leadTime: "", pricing: "fixed", department: "Maldonado", places: [] },
        { id: "f", name: "Zona vieja", priceMinor: 0, leadTime: "", pricing: "fixed" },
        { id: "e", name: "Zona sur", priceMinor: 0, leadTime: "", pricing: "fixed", department: "Montevideo", places: ["Palermo", "Barrio Sur"] },
      ],
    },
  });
  assert.deepEqual(policy.freeAreas, [
    "Montevideo: Carrasco, Pocitos, Palermo y Barrio Sur",
    "Canelones: Ciudad de la Costa",
    "Todo Maldonado",
    "Zona vieja",
  ]);
  const sections = policySections(policy);
  assert.equal(sections.some((s) => s.title.startsWith("Resto")), false);
  assert.equal(
    sections.find((s) => s.title === "Tu dirección")!.text,
    "La zona que elegís al comprar define el departamento y, en las zonas gratis, también el barrio. Después completás calle y número, y si querés el apartamento y alguna indicación.",
  );
});

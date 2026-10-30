import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_POLICY,
  freeDepartments,
  freeShippingLine,
  isShippingPath,
  policyDescription,
  policySections,
  policyTeaser,
  policyTitle,
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
    ["Cuánto tarda", "Envío gratis", "Con costo de envío", "Resto de Montevideo e interior", "Compras grandes", "Retiro", "Cómo sigue"],
  );
  // Piuma's: no pickup section, free zones listed, the rest by WhatsApp.
  const sections = policySections(FALLBACK_POLICY);
  assert.equal(sections.some((s) => s.title === "Retiro"), false);
  assert.equal(
    sections.find((s) => s.title.startsWith("Resto"))!.text,
    "Otros barrios de Montevideo y los 18 departamentos del interior. Lo coordinamos por WhatsApp.",
  );
  // T73 + T91: the free zones by department, free shipping from $ 3.000, no "Tu dirección".
  assert.deepEqual(sections.find((s) => s.title === "Envío gratis")!.items, [
    "Montevideo: Carrasco, Pocitos, Punta Carretas, Ciudad Vieja, Cordón, Malvín, Parque Rodó y Centro",
    "Canelones: Parque Miramar y Ciudad de la Costa",
  ]);
  assert.match(
    sections.find((s) => s.title === "Compras grandes")!.text,
    /^Envío gratis en compras desde \$\s3\.000\.$/,
  );
  assert.equal(sections.some((s) => s.title === "Tu dirección"), false);
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
});

test("the /envios/ description names the first free zones and stays short (T91)", () => {
  const description = policyDescription(FALLBACK_POLICY);
  assert.equal(
    description,
    "Envío gratis en Carrasco, Pocitos, Punta Carretas, Ciudad Vieja y más, llega en 24 a 72 h. Resto del país, a coordinar por WhatsApp.",
  );
  assert.ok(description.length <= 155);
  assert.equal(
    policyDescription({ ...FALLBACK_POLICY, freeZones: ["Pocitos", "Centro"] }),
    "Envío gratis en Pocitos y Centro, llega en 24 a 72 h. Resto del país, a coordinar por WhatsApp.",
  );
});

test("free departments name the /envios/ title and the descriptions (T88)", () => {
  assert.deepEqual(freeDepartments(FALLBACK_POLICY), ["Montevideo", "Canelones"]);
  assert.equal(
    policyTitle(FALLBACK_POLICY, "Piuma"),
    "Envío gratis en zonas de Montevideo y Canelones | Piuma",
  );
  assert.equal(freeShippingLine(FALLBACK_POLICY), "Envío gratis en zonas de Montevideo y Canelones.");
  // Zones without a department, or none free: no promise the policy does not make.
  const plain = { ...FALLBACK_POLICY, freeAreas: ["Pocitos"], freeZones: ["Pocitos"] };
  assert.equal(policyTitle(plain, "Piuma"), "Envíos y entregas | Piuma");
  assert.equal(freeShippingLine(plain), "Envío gratis en Pocitos.");
  assert.equal(freeShippingLine({ ...plain, freeAreas: [], freeZones: [] }), "");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  colorSoldOut,
  sizeSoldOut,
  stockLabel,
} from "../src/app/core/product-info.ts";
import type { Variant } from "../src/app/models/catalog.model.ts";

const variant = (stockByColor?: Record<string, number>): Variant =>
  ({
    size: "Queen",
    productSize: "240×260 cm",
    colors: ["Blanco", "Gris"],
    price: 5200,
    stockByColor,
  }) as Variant;

test("sold out only with API stock: the static catalog never says Agotado", () => {
  assert.equal(colorSoldOut(variant(), "Blanco"), false);
  assert.equal(sizeSoldOut(variant()), false);
  assert.equal(colorSoldOut(variant({ Blanco: 0, Gris: 2 }), "Blanco"), true);
  assert.equal(colorSoldOut(variant({ Blanco: 0, Gris: 2 }), "Gris"), false);
  assert.equal(sizeSoldOut(variant({ Blanco: 0, Gris: 2 })), false);
  assert.equal(sizeSoldOut(variant({ Blanco: 0 })), true);
});

test("stock line: few units are said differently than many", () => {
  assert.deepEqual(stockLabel(0), { text: "Sin stock por el momento", tone: "out" });
  assert.deepEqual(stockLabel(1), { text: "Queda 1 disponible", tone: "low" });
  assert.deepEqual(stockLabel(3), { text: "Quedan 3 disponibles", tone: "low" });
  assert.deepEqual(stockLabel(10), { text: "10 disponibles", tone: "ok" });
});

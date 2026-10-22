import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LINES,
  addUnit,
  estimateMinor,
  guestCart,
  mergeGuest,
  setQuantity,
  unitCount,
} from "../src/app/commerce/cart.ts";
import type { Line, Product } from "../src/app/commerce/commerce.service.ts";

const product = (sku: string, patch: Partial<Product> = {}): Product => ({
  sku,
  productId: "saten",
  categoryId: "sabanas",
  name: "Sábanas satén",
  size: "Queen",
  color: "Beige",
  description: "",
  image: "",
  priceMinor: 250000,
  stock: 3,
  active: true,
  currency: "UYU",
  version: 1,
  ...patch,
});
const lines = (n: number): Line[] =>
  Array.from({ length: n }, (_, i) => ({ sku: "sku-" + i, quantity: 1 }));

test("guest cart keeps only well-formed lines within the limits", () => {
  assert.deepEqual(guestCart(null), []);
  assert.deepEqual(guestCart("not json"), []);
  assert.deepEqual(guestCart('{"sku":"a","quantity":1}'), []);
  assert.deepEqual(
    guestCart(
      JSON.stringify([
        { sku: "a", quantity: 2 },
        { sku: "b", quantity: 0 },
        { sku: "c", quantity: 21 },
        { sku: "d", quantity: 1.5 },
        { sku: 5, quantity: 1 },
        null,
        { sku: "e", quantity: 20 },
      ]),
    ),
    [
      { sku: "a", quantity: 2 },
      { sku: "e", quantity: 20 },
    ],
  );
  assert.equal(guestCart(JSON.stringify(lines(25))).length, MAX_LINES);
});

test("login merges the guest cart into the server one, capped per variant", () => {
  assert.deepEqual(
    mergeGuest(
      [
        { sku: "a", quantity: 18 },
        { sku: "b", quantity: 1 },
      ],
      [
        { sku: "a", quantity: 5 },
        { sku: "c", quantity: 2 },
      ],
    ),
    [
      { sku: "a", quantity: 20 },
      { sku: "b", quantity: 1 },
      { sku: "c", quantity: 2 },
    ],
  );
  assert.deepEqual(mergeGuest([], []), []);
});

test("a merge over 20 variants keeps the server cart untouched (null)", () => {
  assert.equal(mergeGuest(lines(20), [{ sku: "new", quantity: 1 }]), null);
  assert.equal(
    mergeGuest(lines(20), [{ sku: "sku-3", quantity: 1 }])?.length,
    20,
  );
});

test("adding a unit respects the stock the API published", () => {
  const products = [product("a", { stock: 2 }), product("b", { stock: 0 })];
  const once = addUnit([], products, "a");
  assert.deepEqual(once, [{ sku: "a", quantity: 1 }]);
  const twice = addUnit(once, products, "a");
  assert.deepEqual(twice, [{ sku: "a", quantity: 2 }]);
  assert.throws(() => addUnit(twice, products, "a"), /No hay más stock/);
  assert.throws(() => addUnit([], products, "b"), /No hay más stock/);
  assert.throws(() => addUnit([], products, "unknown"), /No hay más stock/);
  assert.throws(() => addUnit([], null, "a"), /No hay más stock/);
});

test("adding keeps the order of the lines and enforces the order limits", () => {
  const products = [product("a", { stock: 99 }), product("z", { stock: 99 })];
  assert.deepEqual(
    addUnit(
      [
        { sku: "a", quantity: 1 },
        { sku: "x", quantity: 1 },
      ],
      products,
      "a",
    ),
    [
      { sku: "a", quantity: 2 },
      { sku: "x", quantity: 1 },
    ],
  );
  assert.throws(
    () => addUnit([{ sku: "a", quantity: 20 }], products, "a"),
    /Máximo 20 unidades/,
  );
  assert.throws(() => addUnit(lines(20), products, "z"), /20 variantes/);
});

test("quantity 0 removes the line; invalid quantities are refused", () => {
  const cart = [
    { sku: "a", quantity: 1 },
    { sku: "b", quantity: 4 },
  ];
  assert.deepEqual(setQuantity(cart, "b", 2), [
    { sku: "a", quantity: 1 },
    { sku: "b", quantity: 2 },
  ]);
  assert.deepEqual(setQuantity(cart, "a", 0), [{ sku: "b", quantity: 4 }]);
  for (const bad of [-1, 21, 1.5, Number.NaN])
    assert.throws(() => setQuantity(cart, "a", bad), /Cantidad válida/);
});

test("count and estimate add up units; unknown SKUs price as 0", () => {
  const cart = [
    { sku: "a", quantity: 2 },
    { sku: "gone", quantity: 1 },
  ];
  assert.equal(unitCount(cart), 3);
  assert.equal(unitCount([]), 0);
  assert.equal(estimateMinor(cart, [product("a")]), 500000);
  assert.equal(estimateMinor(cart, null), 0);
});

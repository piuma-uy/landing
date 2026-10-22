import { test } from "node:test";
import assert from "node:assert/strict";
import { adaptCatalog } from "../src/app/core/catalog-adapter.ts";
import type { Category } from "../src/app/models/catalog.model.ts";
import type { Product } from "../src/app/commerce/commerce.service.ts";

const source: Category[] = [
  {
    id: "sabanas",
    name: "Sábanas",
    image: "assets/sabanas.webp",
    alt: "Sábanas sobre una cama",
    types: [
      {
        id: "saten",
        name: "Satén",
        fullName: "Sábanas 300 hilos satén",
        material: "100% algodón",
        description: "Copia del catálogo",
        currency: "UYU",
        image: "assets/saten.webp",
        alt: "Sábanas satén",
        features: ["300 hilos"],
        variants: [
          {
            size: "Queen",
            bedSize: "160x200 cm",
            productSize: "240x270 cm",
            colors: ["Beige"],
            price: 1,
          },
        ],
      },
    ],
  },
];
const product = (sku: string, patch: Partial<Product> = {}): Product => ({
  sku,
  productId: "saten",
  categoryId: "sabanas",
  name: "Sábanas satén (API)",
  size: "Queen",
  color: "Beige",
  description: "Descripción del API",
  image: "api/saten.webp",
  priceMinor: 250000,
  stock: 3,
  active: true,
  currency: "UYU",
  version: 1,
  ...patch,
});

test("SKUs group into category → type → size with price and stock per color", () => {
  const [category, ...rest] = adaptCatalog(source, [
    product("q-beige"),
    product("q-gris", { color: "Gris", priceMinor: 240000, stock: 0 }),
    product("k-beige", { size: "King", priceMinor: 300000 }),
  ]);
  assert.equal(rest.length, 0);
  assert.equal(category!.name, "Sábanas");
  assert.equal(category!.types.length, 1);
  const type = category!.types[0]!;
  assert.deepEqual(
    type.variants.map((v) => v.size),
    ["Queen", "King"],
  );
  const queen = type.variants[0]!;
  assert.deepEqual(queen.colors, ["Beige", "Gris"]);
  assert.deepEqual(queen.skuByColor, { Beige: "q-beige", Gris: "q-gris" });
  assert.deepEqual(queen.priceByColor, { Beige: 250000, Gris: 240000 });
  assert.deepEqual(queen.stockByColor, { Beige: 3, Gris: 0 });
  // The card shows the lowest price of the size, in pesos.
  assert.equal(queen.price, 2400);
  assert.equal(type.variants[1]!.price, 3000);
});

test("the static catalog keeps its copy; the API keeps price, stock and description", () => {
  const type = adaptCatalog(source, [product("q-beige")])[0]!.types[0]!;
  assert.equal(type.name, "Satén");
  assert.equal(type.fullName, "Sábanas satén (API)");
  assert.equal(type.material, "100% algodón");
  assert.deepEqual(type.features, ["300 hilos"]);
  assert.equal(type.description, "Descripción del API");
  assert.equal(type.image, "api/saten.webp");
  const queen = type.variants[0]!;
  assert.equal(queen.bedSize, "160x200 cm");
  assert.equal(queen.productSize, "240x270 cm");
  assert.equal(queen.price, 2500);
  // The source object is never mutated.
  assert.equal(source[0]!.types[0]!.variants[0]!.price, 1);
  assert.deepEqual(source[0]!.types[0]!.variants[0]!.colors, ["Beige"]);
});

test("products unknown to the static catalog still show with API data", () => {
  const [category] = adaptCatalog(source, [
    product("toalla-1", {
      categoryId: "toallas-de-bano",
      productId: "toalla",
      name: "Toalla",
      size: "70x140",
    }),
  ]);
  assert.equal(category!.name, "toallas de bano");
  assert.equal(category!.image, "api/saten.webp");
  const type = category!.types[0]!;
  assert.equal(type.name, "Toalla");
  assert.equal(type.material, null);
  assert.equal(type.variants[0]!.productSize, "70x140");
});

test("no products means an empty catalog, not the static one", () => {
  assert.deepEqual(adaptCatalog(source, []), []);
});

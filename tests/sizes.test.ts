import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SIZE_ORDER, sortCatalogSizes, sortSizes } from "../src/app/core/sizes.ts";
import { SIZE_GUIDE, guideColumn, type GuideColumn } from "../src/app/core/size-guide.ts";
import { adaptCatalog } from "../src/app/core/catalog-adapter.ts";
import type { Category } from "../src/app/models/catalog.model.ts";
import type { Product } from "../src/app/commerce/commerce.service.ts";

const catalog: Category[] = JSON.parse(
  await readFile(new URL("../src/assets/data/catalog.json", import.meta.url), "utf8"),
);
const sizes = (variants: { size: string }[]) => variants.map((v) => v.size);

test("sizes go from the smallest bed to the largest, pillows 50x70 → 50x90 (T91)", () => {
  // The order the API used to return (by SKU), as the client saw it in the selector.
  const shuffled = ["Dos plazas / Full", "Super King", "Plaza y media", "Twin", "King", "Queen"];
  assert.deepEqual(sizes(sortSizes(shuffled.map((size) => ({ size })))), SIZE_ORDER.slice(0, 6));
  assert.deepEqual(sizes(sortSizes([{ size: "50x90" }, { size: "50x70" }])), ["50x70", "50x90"]);
  // Bedspreads say "Dos plazas"; an unknown size goes last, in the order it came.
  assert.deepEqual(
    sizes(sortSizes([{ size: "Otra" }, { size: "Queen" }, { size: "Dos plazas" }, { size: "Twin" }])),
    ["Twin", "Dos plazas", "Queen", "Otra"],
  );
});

test("the API catalog comes out sorted whatever the SKU order (T91)", () => {
  const product = (sku: string, size: string): Product => ({
    sku,
    productId: "sabanas-percal",
    categoryId: "sabanas",
    name: "Sábanas 200 hilos percal",
    size,
    color: "Blanco",
    description: "",
    image: "",
    priceMinor: 100000,
    stock: 1,
    active: true,
    currency: "UYU",
    version: 1,
  });
  const [category] = adaptCatalog(catalog, [
    product("a", "Dos plazas / Full"),
    product("b", "Super King"),
    product("c", "Plaza y media"),
    product("d", "Twin"),
    product("e", "King"),
    product("f", "Queen"),
  ]);
  assert.deepEqual(sizes(category!.types[0]!.variants), SIZE_ORDER.slice(0, 6));
});

test("the static catalog is already in order, and sorting it changes nothing", () => {
  assert.deepEqual(sortCatalogSizes(catalog), catalog);
});

test("product sizes match the client's guide (T91)", () => {
  const product = (id: string) => catalog.flatMap((c) => c.types).find((t) => t.id === id)!;
  const check = (id: string, column: GuideColumn) => {
    for (const variant of product(id).variants) {
      const row = SIZE_GUIDE.find((r) => r.size === (variant.size === "Dos plazas" ? "Dos plazas / Full" : variant.size));
      assert.ok(row, `${id} ${variant.size}`);
      assert.equal(variant.productSize.replace(" cm", "").replace("x", " × "), row.sizes[column], `${id} ${variant.size}`);
      if (variant.bedSize) assert.equal(variant.bedSize.replace(" cm", "").replace("x", " × "), row.bed);
    }
  };
  for (const id of ["sabanas-percal", "sabanas-saten"]) check(id, "sheets");
  // The Downproof cover is sized like the duvets: pending with the client (B22).
  for (const id of ["funda-nordica-saten", "funda-nordica-lino"]) check(id, "duvetCovers");
  for (const id of ["acolchado-pluma-natural", "acolchado-pluma-sintetica", "relleno-nordico-polyester"]) check(id, "duvets");
  for (const id of ["cubrecama-chiara", "cubrecama-petra", "cubrecama-charo"]) check(id, "bedspreads");
  assert.equal(guideColumn("cubrecamas"), "bedspreads");
  assert.equal(guideColumn("almohadas"), null);
});

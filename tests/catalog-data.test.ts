import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Los JSON de src/assets y public se publican tal cual: cualquiera los lee en /assets/... (T116).
const SHIPPED = ["../src/assets/data/catalog.json", "../public/runtime-config.json"];

/** Rutas de las claves internas (`_todo`, `_nota`, …) que hubiera en el dato. */
function internalKeys(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => internalKeys(item, `${path}[${i}]`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(key.startsWith("_") ? [`${path}.${key}`] : []),
    ...internalKeys(child, `${path}.${key}`),
  ]);
}

test("internalKeys encuentra claves internas anidadas", () => {
  assert.deepEqual(internalKeys([{ id: "a", types: [{ _todo: "x", ok: 1 }] }]), ["$[0].types[0]._todo"]);
  assert.deepEqual(internalKeys({ a: [1, "b", null] }), []);
});

for (const file of SHIPPED) {
  test(`${file.slice(3)} no publica notas internas (claves con "_" ni _todo)`, async () => {
    const text = await readFile(new URL(file, import.meta.url), "utf8");
    assert.deepEqual(internalKeys(JSON.parse(text)), []);
    assert.doesNotMatch(text, /_todo/i);
  });
}

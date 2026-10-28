import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { photoSrcset } from "../src/app/core/photos.ts";

const folder = new URL("../src/assets/images/productos/", import.meta.url);

test("own product photos offer the 400 px version next to the 800 px one", () => {
  assert.equal(
    photoSrcset("assets/images/productos/producto-sabanas-percal.webp"),
    "assets/images/productos/producto-sabanas-percal-400w.webp 400w, " +
      "assets/images/productos/producto-sabanas-percal.webp 800w",
  );
});

test("anything else keeps its src alone", () => {
  for (const src of [
    null,
    undefined,
    "",
    "https://cdn.example.test/foto.webp",
    "assets/images/hero-piuma.webp",
    "assets/images/productos/otra/carpeta.webp",
    "assets/images/productos/producto-sabanas-percal-400w.webp",
    "assets/images/productos/foto.jpg",
  ])
    assert.equal(photoSrcset(src), null, String(src));
});

test("every product photo has its 400 px version (a new photo needs both)", () => {
  const files = new Set(readdirSync(folder));
  const missing = [...files]
    .filter((f) => f.endsWith(".webp") && !f.endsWith("-400w.webp"))
    .filter((f) => !files.has(f.replace(/\.webp$/, "-400w.webp")));
  assert.deepEqual(missing, []);
});

test("every photo the catalog names exists", () => {
  const catalog = readFileSync(new URL("../src/assets/data/catalog.json", import.meta.url), "utf8");
  const named = new Set(catalog.match(/assets\/images\/productos\/[a-z0-9-]+\.webp/g));
  assert.ok(named.size > 10);
  for (const src of named) {
    assert.ok(existsSync(new URL(src.replace("assets/images/productos/", ""), folder)), src);
    assert.ok(photoSrcset(src), src);
  }
});

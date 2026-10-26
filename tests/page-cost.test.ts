import { test } from "node:test";
import assert from "node:assert/strict";
import { pageCostMessage } from "../src/app/core/page-cost.ts";

test("weight and load time of the visit, in Uruguayan Spanish", () => {
  assert.equal(
    pageCostMessage({ transferSize: 4_200, loadEventEnd: 612.4 }, [
      { transferSize: 61_000 },
      { transferSize: 38_900 },
    ]),
    "Esta página pesó 104 kB y cargó en 0,6 s. Lo midió tu navegador; no se guarda ni se envía.",
  );
});

test("past a thousand kB it says MB, as people read it", () => {
  assert.match(
    pageCostMessage({ transferSize: 30_000, loadEventEnd: 400 }, [
      { transferSize: 1_053_000 },
    ]) ?? "",
    /pesó 1,1 MB y cargó en 0,4 s/,
  );
});

test("a visit served from the cache says so instead of a tiny weight", () => {
  assert.equal(
    pageCostMessage({ transferSize: 300, loadEventEnd: 180 }, [
      { transferSize: 0 },
      { transferSize: 0 },
    ]),
    "Esta página cargó en 0,2 s, casi toda desde la caché de tu navegador. Lo midió tu navegador; no se guarda ni se envía.",
  );
});

test("never shows 0,0 s", () => {
  assert.match(
    pageCostMessage({ transferSize: 50_000, loadEventEnd: 12 }, []) ?? "",
    /cargó en 0,1 s/,
  );
});

test("nothing until the load finished or without a navigation entry", () => {
  assert.equal(pageCostMessage(undefined, []), null);
  assert.equal(
    pageCostMessage({ transferSize: 50_000, loadEventEnd: 0 }, []),
    null,
  );
});

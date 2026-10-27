import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkPhone,
  countries,
  countryOf,
  formatTyping,
  fromE164,
} from "../src/app/commerce/phone.ts";

// T71: the checkout's celular, with the API's rule (piuma-backend tests/profile-phone.test.ts).
test("a Uruguayan celular typed any way is valid and goes out as E.164", () => {
  for (const typed of [
    "091813234",
    "091 813 234",
    "91813234",
    "+598 91 813 234",
    "00598 91 813 234",
  ])
    assert.deepEqual(
      checkPhone(typed, "UY"),
      { e164: "+59891813234", problem: null },
      typed,
    );
});

test("six digits, landlines and short numbers are explained in plain Spanish", () => {
  assert.match(
    checkPhone("123456", "UY").problem!,
    /9 dígitos y empieza con 09/,
  );
  assert.match(checkPhone("0918132", "UY").problem!, /09/);
  assert.match(checkPhone("090123456", "UY").problem!, /09/);
  assert.match(checkPhone("2400 1234", "UY").problem!, /fijo/);
  assert.match(checkPhone("", "UY").problem!, /coordinar la entrega/);
  assert.match(checkPhone("  ", "UY").problem!, /coordinar la entrega/);
});

test("foreigners pick their country or type the code", () => {
  assert.equal(checkPhone("9 11 1234 5678", "AR").e164, "+5491112345678");
  assert.equal(checkPhone("+54 9 11 1234 5678", "UY").e164, "+5491112345678");
  assert.equal(checkPhone("(415) 555-2671", "US").e164, "+14155552671");
  assert.match(checkPhone("11 12", "AR").problem!, /ese país/);
  // A Uruguayan number keeps the Uruguayan rule whatever country is selected.
  assert.match(checkPhone("+598 2400 1234", "AR").problem!, /fijo/);
});

test("formatting while typing, autofill country and saved numbers back in the field", () => {
  assert.equal(formatTyping("0918", "UY"), "091 8");
  assert.equal(formatTyping("091813234", "UY"), "091 813 234");
  assert.equal(countryOf("+54 9 11 1234 5678"), "AR");
  assert.equal(countryOf("0054 9 11 1234 5678"), "AR");
  assert.equal(countryOf("091813234"), undefined);
  assert.deepEqual(fromE164("+59891813234"), {
    country: "UY",
    text: "091 813 234",
  });
  assert.deepEqual(fromE164("+5491112345678"), {
    country: "AR",
    text: "9 11 1234 5678",
  });
  assert.equal(fromE164("nonsense"), null);
});

test("country list: Uruguay first, then alphabetical in Spanish, with calling codes", () => {
  const list = countries();
  assert.deepEqual(list[0], { code: "UY", name: "Uruguay", dial: "598" });
  const ar = list.find((c) => c.code === "AR")!;
  assert.equal(ar.name, "Argentina");
  assert.equal(ar.dial, "54");
  const names = list.slice(1).map((c) => c.name);
  assert.deepEqual(
    names,
    [...names].sort((a, b) => a.localeCompare(b, "es")),
  );
  assert.equal(new Set(list.map((c) => c.code)).size, list.length);
});

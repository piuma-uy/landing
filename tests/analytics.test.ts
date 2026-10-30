import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exceptionProperties,
  optedOut,
  referrerOrigin,
  scrub,
  stackFrames,
  uuidv7,
} from "../src/app/services/analytics-privacy.ts";

test("Do Not Track and Global Privacy Control both turn analytics off (FE-08)", () => {
  assert.equal(optedOut({ doNotTrack: "1" }), true);
  assert.equal(optedOut({ globalPrivacyControl: true }), true);
  assert.equal(
    optedOut({ doNotTrack: "0", globalPrivacyControl: false }),
    false,
  );
  assert.equal(optedOut({ doNotTrack: null }), false);
});

test("only the origin of an external referrer is sent (FE-08)", () => {
  const self = "https://piuma.uy";
  assert.equal(
    referrerOrigin(
      "https://l.instagram.com/?u=https%3A%2F%2Fpiuma.uy&e=secret",
      self,
    ),
    "https://l.instagram.com",
  );
  assert.equal(
    referrerOrigin("https://piuma.uy/catalogo/sabanas?x=1", self),
    "",
  );
  assert.equal(referrerOrigin("", self), "");
  assert.equal(referrerOrigin("no es una url", self), "");
  assert.equal(referrerOrigin("data:text/html,hola", self), "");
});

test("the visit id is a random UUIDv7, nothing derived from the visitor (T97)", () => {
  const random = new Uint8Array(16).fill(0xff);
  const id = uuidv7(Date.UTC(2026, 9, 30), random);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  // The first 48 bits are the time in ms, so PostHog can tell when the visit started.
  assert.equal(parseInt(id.replace(/-/g, "").slice(0, 12), 16), Date.UTC(2026, 9, 30));
  assert.notEqual(uuidv7(0, new Uint8Array(16)), uuidv7(0, random));
});

test("error texts lose mails, long numbers and URL queries (T97)", () => {
  assert.equal(
    scrub("No se pudo guardar ana.perez@gmail.com con 099 123 456"),
    "No se pudo guardar [mail] con [n]",
  );
  assert.equal(
    scrub("Falló https://piuma.uy/?code=abc&state=xyz y +598 99123456"),
    "Falló https://piuma.uy/ y [n]",
  );
  assert.equal(scrub("Pedido 4 de 10 unidades"), "Pedido 4 de 10 unidades");
  assert.equal(scrub("x".repeat(500)).length, 300);
});

test("stack frames keep file and line, drop queries and mark the app's own code (T97)", () => {
  const origin = "https://piuma.uy";
  const chrome = [
    "TypeError: x is undefined",
    "    at ze (https://piuma.uy/main-ABC.js:1:2345)",
    "    at https://piuma.uy/polyfills.js?v=1:2:10",
    "    at chrome-extension://abc/inject.js:3:4",
  ].join("\n");
  assert.deepEqual(
    stackFrames(chrome, origin).map((f) => [f.function, f.filename, f.lineno, f.colno, f.in_app]),
    [
      ["?", "chrome-extension://abc/inject.js", 3, 4, false],
      ["?", "/polyfills.js", 2, 10, true],
      ["ze", "/main-ABC.js", 1, 2345, true],
    ],
  );
  const safari = "ze@https://piuma.uy/main-ABC.js:1:2345\n@https://piuma.uy/main-ABC.js#x:9:1";
  assert.deepEqual(
    stackFrames(safari, origin).map((f) => [f.function, f.filename]),
    [["?", "/main-ABC.js"], ["ze", "/main-ABC.js"]],
  );
  assert.equal(stackFrames("a\n".repeat(5) + chrome.repeat(10), origin, 15).length, 15);
});

test("an exception becomes PostHog's $exception_list without personal data (T97)", () => {
  const error = new Error("Falló el pago de juan@piuma.uy");
  error.stack = "Error: x\n    at pay (https://piuma.uy/main.js:1:2)";
  const [entry] = exceptionProperties(error, "https://piuma.uy").$exception_list;
  assert.equal(entry!.type, "Error");
  assert.equal(entry!.value, "Falló el pago de [mail]");
  assert.deepEqual(entry!.mechanism, { handled: false, synthetic: false });
  assert.equal(entry!.stacktrace?.frames[0]?.function, "pay");
  const [thrown] = exceptionProperties("roto", "https://piuma.uy").$exception_list;
  assert.equal(thrown!.value, "roto");
  assert.equal(thrown!.mechanism.synthetic, true);
  assert.equal("stacktrace" in thrown!, false);
});

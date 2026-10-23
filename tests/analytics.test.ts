import { test } from "node:test";
import assert from "node:assert/strict";
import {
  optedOut,
  referrerOrigin,
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

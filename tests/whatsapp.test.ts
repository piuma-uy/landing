import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SITE_CONFIG } from "../src/app/core/site-config.ts";
import {
  contactMessage,
  formatWhatsapp,
  generalMessage,
  normalizeWhatsapp,
  preferServer,
  productMessage,
  receiptMessage,
  safeWaUrl,
  shippingMessage,
  shopWhatsapp,
  waLink,
} from "../src/app/core/whatsapp.ts";

test("Piuma's number is +598 91 345 454", () => {
  assert.equal(normalizeWhatsapp(SITE_CONFIG.whatsappNumber), "+59891345454");
  assert.equal(formatWhatsapp(SITE_CONFIG.whatsappNumber), "+598 91 345 454");
});

test("what a person types is normalized to E.164", () => {
  for (const typed of [
    "+598 91 345 454",
    "+598 91-345-454",
    "+59891345454",
    "0059891345454",
    "59891345454",
    "091 345 454",
    "91345454",
    " (+598) 91 345 454 ",
  ])
    assert.equal(normalizeWhatsapp(typed), "+59891345454", typed);
  assert.equal(normalizeWhatsapp("+54 9 11 2345 6789"), "+5491123456789");
  for (const bad of [
    null,
    undefined,
    "",
    "   ",
    "abc",
    "+598 91 345 454 int 2",
    "123",
    "+0598913454",
    "++59891345454",
    "+5989134545412345678",
  ])
    assert.equal(normalizeWhatsapp(bad), null, String(bad));
  assert.equal(formatWhatsapp("+5491123456789"), "+5491123456789");
  assert.equal(formatWhatsapp("nada"), "");
});

test("the API number wins over the site one only when it is valid", () => {
  assert.equal(shopWhatsapp("+59899000000", "59891345454"), "+59899000000");
  assert.equal(shopWhatsapp("099 000 000", "59891345454"), "+59899000000");
  assert.equal(shopWhatsapp(null, "59891345454"), "+59891345454");
  assert.equal(shopWhatsapp(undefined, "59891345454"), "+59891345454");
  assert.equal(shopWhatsapp("no es un número", "59891345454"), "+59891345454");
});

test("links go to wa.me with the digits and the message encoded", () => {
  assert.equal(
    waLink(
      "+598 91 345 454",
      "¡Hola Piuma! ¿Hay 2 × 1,5 plazas? 100% algodón & lino\nGracias",
    ),
    "https://wa.me/59891345454?text=%C2%A1Hola%20Piuma!%20%C2%BFHay%202%20%C3%97%201%2C5%20plazas%3F%20100%25%20algod%C3%B3n%20%26%20lino%0AGracias",
  );
  const url = new URL(waLink("+59891345454", generalMessage("Piuma")));
  assert.equal(url.origin + url.pathname, "https://wa.me/59891345454");
  assert.equal(
    url.searchParams.get("text"),
    "¡Hola Piuma! Quiero consultar sobre sus productos.",
  );
  assert.equal(waLink("", "Hola"), "");
});

test("a server link wins when it is https wa.me; anything else falls back", () => {
  const server = "https://wa.me/59899000000?text=Hola%20Piuma";
  assert.equal(safeWaUrl(server), server);
  for (const bad of [
    "javascript:alert(1)",
    "http://wa.me/598",
    "https://evil.test/wa.me",
    "",
    null,
    undefined,
  ])
    assert.equal(safeWaUrl(bad), null, String(bad));
  assert.equal(preferServer(server, "+59891345454", "x"), server);
  assert.equal(
    preferServer("javascript:alert(1)", "+59891345454", "x"),
    "https://wa.me/59891345454?text=x",
  );
  assert.equal(
    preferServer(undefined, "+59891345454", "x"),
    "https://wa.me/59891345454?text=x",
  );
});

test("prefilled messages carry reference, amount, product and size", () => {
  assert.equal(
    receiptMessage("Piuma", "ABCD1234", "$ 3.000,50"),
    "¡Hola Piuma! Te envío el comprobante de la transferencia del pedido ABCD1234 por $ 3.000,50.",
  );
  assert.equal(
    productMessage(
      "Piuma",
      "Sábanas 300 hilos satén",
      "Blanco",
      "2 plazas",
      "160 × 200 cm",
    ),
    "¡Hola Piuma! Quiero consultar sobre Sábanas 300 hilos satén, color blanco, medida 2 plazas (160 × 200 cm). ¿Está disponible?",
  );
  assert.equal(
    shippingMessage("Piuma", "#abcd1234", "Interior", {
      street: "Av. Italia 1234",
      city: "Montevideo",
      department: "Montevideo",
    }),
    "¡Hola Piuma! Quiero coordinar el envío del pedido #abcd1234 (zona Interior, a Av. Italia 1234, Montevideo, Montevideo).",
  );
  assert.equal(
    shippingMessage("Piuma", "#abcd1234", "Costa"),
    "¡Hola Piuma! Quiero coordinar el envío del pedido #abcd1234 (zona Costa).",
  );
  assert.equal(
    contactMessage("Ana", "ana@example.test", "Hola"),
    "Hola, soy Ana. Mi correo es ana@example.test.\n\nHola",
  );
});

test("the number is written only in site-config", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  const hits = [...files("src"), ...files("scripts"), ...files("public")]
    .filter((f) => /\.(ts|html|scss|json)$/.test(f))
    .filter((f) => /91\D?345\D?454/.test(readFileSync(f, "utf8")));
  assert.deepEqual(hits, [join("src", "app", "core", "site-config.ts")]);
});

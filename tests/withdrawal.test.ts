import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SITE_CONFIG } from "../src/app/core/site-config.ts";
import type { Category } from "../src/app/models/catalog.model.ts";
import { WITHDRAWAL_LINK, legalTexts } from "../src/app/core/legal.ts";
import { LEGAL_PAGES } from "../src/app/core/legal-pages.ts";
import { WITHDRAWAL_LABEL, WITHDRAWAL_PATH, isWithdrawalPath } from "../src/app/core/withdrawal.ts";
import {
  PROBLEMS,
  checkWithdrawal,
  normalizeOrderCode,
  problemsFromApi,
  receiptTime,
  sendWithdrawal,
  withdrawalBody,
} from "../src/app/core/withdrawal-form.ts";
import { prerenderPages, siteLegalDocs, sitemapXml } from "../scripts/seo.ts";

// «Botón de arrepentimiento» (T109): Ley 17.250 art. 16, redacción de la Ley 20.531 art. 108.
const categories: Category[] = JSON.parse(
  await readFile(new URL("../src/assets/data/catalog.json", import.meta.url), "utf8"),
);
const index = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
const form = (f: Partial<{ orderCode: string; contact: string; reason: string }>) => ({
  orderCode: "A1B2C3D4",
  contact: "ana@example.test",
  reason: "",
  ...f,
});

test("el vínculo se llama como dice la ley y vive en /arrepentimiento/", () => {
  assert.equal(WITHDRAWAL_LABEL, "Botón de arrepentimiento");
  assert.deepEqual(WITHDRAWAL_LINK, { label: WITHDRAWAL_LABEL, path: WITHDRAWAL_PATH });
  assert.ok(isWithdrawalPath("/arrepentimiento/") && isWithdrawalPath("/arrepentimiento"));
  for (const other of ["/", "/arrepentimiento/x", "/cambios-y-devoluciones/"])
    assert.equal(isWithdrawalPath(other), false, other);
});

test("formulario mínimo: pedido de 8 caracteres, mail o teléfono, motivo opcional", () => {
  assert.equal(normalizeOrderCode(" #a1b2 c3d4 "), "A1B2C3D4");
  assert.deepEqual(checkWithdrawal(form({})), {});
  assert.deepEqual(checkWithdrawal(form({ orderCode: "#a1b2c3d4", contact: "099 123 456" })), {});
  assert.deepEqual(checkWithdrawal(form({ orderCode: "A1B2" })), { orderCode: PROBLEMS.orderCode });
  assert.deepEqual(checkWithdrawal(form({ orderCode: "ZZZZZZZZ" })), { orderCode: PROBLEMS.orderCode });
  for (const contact of ["", "ana@", "ana", "12 34"])
    assert.deepEqual(checkWithdrawal(form({ contact })), { contact: PROBLEMS.contact }, contact);
  assert.deepEqual(checkWithdrawal(form({ reason: "x".repeat(501) })), { reason: PROBLEMS.reason });
  // Sin motivo no se manda el campo; el resto, como lo guarda el API.
  assert.deepEqual(withdrawalBody(form({ orderCode: "a1b2 c3d4", contact: " ana@example.test ", reason: "  " })), {
    orderCode: "A1B2C3D4",
    contact: "ana@example.test",
  });
  assert.deepEqual(withdrawalBody(form({ reason: " No me gustó " })).reason, "No me gustó");
});

test("un 400 del API vuelve al campo que lo causó", () => {
  assert.deepEqual(problemsFromApi([{ path: "contact" }, { path: "" }, { path: "otro" }]), {
    contact: PROBLEMS.contact,
  });
  assert.deepEqual(problemsFromApi(undefined), {});
});

test("la constancia muestra la hora de Uruguay", () => {
  assert.match(receiptTime("2027-01-05T14:00:00.000Z"), /5\/1\/(20)?27.*11:00/);
});

test("pie de todas las páginas prerenderizadas, también con el borrador legal en prod (T99)", () => {
  for (const legalPages of [LEGAL_PAGES, []]) {
    const site = { ...SITE_CONFIG, url: "https://piuma.uy", legalPages };
    const pages = prerenderPages(index, site, categories);
    for (const p of pages)
      assert.ok(p.html.includes(`<a href="/arrepentimiento/">Botón de arrepentimiento</a>`), p.path);
    const page = pages.find((p) => p.path === WITHDRAWAL_PATH)!;
    assert.ok(page.html.includes("<title>Botón de arrepentimiento | Piuma</title>"));
    assert.ok(page.html.includes("<h1>Botón de arrepentimiento</h1>"));
    // Sin JavaScript no hay formulario: mail y WhatsApp, que también valen como aviso.
    assert.ok(page.html.includes(`mailto:${SITE_CONFIG.email}`));
    assert.ok(page.html.includes("wa.me/" + SITE_CONFIG.whatsappNumber));
    assert.ok(page.html.includes("10 días corridos"));
    assert.ok(sitemapXml(site, categories, "2027-01-01").includes(`<loc>https://piuma.uy${WITHDRAWAL_PATH}</loc>`));
  }
});

test("términos y cambios y devoluciones apuntan al botón", () => {
  const site = { ...SITE_CONFIG, url: "https://piuma.uy", legalPages: LEGAL_PAGES };
  const docs = siteLegalDocs(site);
  for (const id of ["terminos", "cambios"] as const) {
    const doc = docs.find((d) => d.id === id)!;
    assert.ok(legalTexts(doc).join("\n").includes("Botón de arrepentimiento, al pie de cada página y en Mis pedidos"), id);
    assert.ok(doc.sections.some((s) => s.link?.path === WITHDRAWAL_PATH), id);
  }
  const html = prerenderPages(index, site, categories).find((p) => p.path === "/cambios-y-devoluciones/")!.html;
  assert.ok(html.includes(`<p><a href="/arrepentimiento/">Botón de arrepentimiento</a></p>`));
});

test("envío: Idempotency-Key, constancia, 400 por campo y fallas con su mensaje", async () => {
  const calls: { path: string; init: RequestInit }[] = [];
  const answer = (status: number, data: unknown) => async (path: string, init: RequestInit) => {
    calls.push({ path, init });
    return new Response(JSON.stringify(data), { status });
  };
  const body = withdrawalBody(form({}));
  const receipt = { number: "AR-3F9A21C0", orderCode: "A1B2C3D4", createdAt: "2027-01-05T14:00:00.000Z" };
  assert.deepEqual(await sendWithdrawal(answer(200, receipt), body, "k-0000000000000001"), { receipt });
  assert.equal(calls[0]!.path, "/withdrawal-requests");
  assert.equal(calls[0]!.init.method, "POST");
  assert.deepEqual(calls[0]!.init.headers, {
    "Content-Type": "application/json",
    "Idempotency-Key": "k-0000000000000001",
  });
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), body);
  assert.deepEqual(
    await sendWithdrawal(
      answer(400, { error: { code: "VALIDATION_ERROR", message: "x", details: [{ path: "contact", message: "y" }] } }),
      body,
      "k",
    ),
    { problems: { contact: PROBLEMS.contact } },
  );
  const limited = await sendWithdrawal(
    answer(429, { error: { code: "WITHDRAWAL_RATE_LIMIT", message: "Recibimos muchas solicitudes desde tu conexión." } }),
    body,
    "k",
  );
  assert.deepEqual(limited, { error: "Recibimos muchas solicitudes desde tu conexión.", retry: true });
  const down = await sendWithdrawal(answer(503, { message: "Service Unavailable" }), body, "k");
  assert.ok("error" in down && down.retry && !down.error.includes("Service"));
  const offline = await sendWithdrawal(
    async () => {
      throw new TypeError("Failed to fetch");
    },
    body,
    "k",
  );
  assert.ok("error" in offline && offline.retry && !offline.error.includes("fetch"));
});

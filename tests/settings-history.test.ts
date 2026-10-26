import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bankChange,
  changedBy,
  historyItem,
  listJoin,
  when,
  maskAccount,
  needsOlder,
  type SettingsHistoryEntry,
} from "../src/app/commerce/settings-history.ts";

const NOW = Date.parse("2026-10-23T15:00:00.000Z");
const DAY = 86_400_000;
const bank = (accountNumber: string) => ({
  bank: "BROU",
  accountType: "Caja de ahorro",
  accountNumber,
  holder: "Piuma SAS",
  currency: "UYU",
  note: "",
});
const entry = (
  daysAgo: number,
  over: Partial<SettingsHistoryEntry> = {},
): SettingsHistoryEntry => ({
  version: 10 - daysAgo,
  changedAt: new Date(NOW - daysAgo * DAY).toISOString(),
  changedBy: "sub-123",
  changedByEmail: "admin@piuma.uy",
  changes: [
    {
      field: "transfer.instructions",
      before: bank("001-1234567"),
      after: bank("009-7654321"),
    },
  ],
  sensitive: true,
  shopEmail: "avisos@piuma.uy",
  ...over,
});

test("maskAccount keeps only the last 4 digits", () => {
  assert.equal(maskAccount("001-1234567"), "•••• 4567");
  assert.equal(maskAccount("12"), "•••• 12");
  assert.equal(maskAccount(""), "");
  assert.equal(maskAccount(null), "");
});

test("historyItem: one sentence, values before → after, account masked", () => {
  const item = historyItem(
    entry(0, {
      changes: [
        {
          field: "transfer.instructions",
          before: null,
          after: bank("001-1234567"),
        },
        {
          field: "contact.whatsappNumber",
          before: null,
          after: "+59899123456",
        },
        {
          field: "notifications.shopEmail",
          before: "a@piuma.uy",
          after: "b@piuma.uy",
        },
        { field: "notifications.whatsappEnabled", before: false, after: true },
        { field: "shipping" },
      ],
    }),
    null,
    NOW,
  );
  assert.equal(item?.who, "admin@piuma.uy");
  assert.equal(
    item?.what,
    "cambió los datos bancarios, el WhatsApp, el mail, los avisos por WhatsApp y los envíos",
  );
  assert.deepEqual(item?.details, [
    {
      label: "Datos bancarios",
      before: "Sin datos",
      after: "BROU · Caja de ahorro · •••• 4567 · Piuma SAS · UYU",
    },
    { label: "WhatsApp", before: "Sin número", after: "+598 99 123 456" },
    { label: "Mail", before: "a@piuma.uy", after: "b@piuma.uy" },
    { label: "Avisos por WhatsApp", before: "Apagados", after: "Activados" },
  ]);
  assert.ok(
    !JSON.stringify(item).includes("1234567"),
    "full account never shown",
  );
});

test("changedBy prefers the mail and falls back to the sub", () => {
  assert.equal(changedBy(entry(0)), "admin@piuma.uy");
  assert.equal(changedBy(entry(0, { changedByEmail: null })), "sub-123");
});

test("bankChange: newest bank details change of the last 7 days", () => {
  const latest = entry(1);
  assert.deepEqual(
    bankChange(
      [
        entry(0, { changes: [{ field: "shipping" }], sensitive: false }),
        latest,
        entry(3),
      ],
      NOW,
    ),
    {
      changedAt: latest.changedAt,
      by: "admin@piuma.uy",
    },
  );
  assert.equal(bankChange([entry(7.01)], NOW), null);
  assert.ok(bankChange([entry(6.99)], NOW));
  // WhatsApp or mail changes are sensitive too, but the alert is about bank details.
  assert.equal(
    bankChange(
      [
        entry(0, {
          changes: [
            {
              field: "contact.whatsappNumber",
              before: null,
              after: "+59899123456",
            },
          ],
        }),
      ],
      NOW,
    ),
    null,
  );
  assert.equal(bankChange([], NOW), null);
});

test("needsOlder reads more pages only while a recent bank change could be there", () => {
  const recentOther = entry(2, {
    changes: [{ field: "orders" }],
    sensitive: false,
  });
  assert.equal(needsOlder([recentOther], "cursor", NOW), true);
  assert.equal(needsOlder([], "cursor", NOW), true);
  assert.equal(needsOlder([recentOther], undefined, NOW), false);
  assert.equal(needsOlder([entry(1)], "cursor", NOW), false);
  assert.equal(
    needsOlder(
      [{ ...recentOther, changedAt: entry(8).changedAt }],
      "cursor",
      NOW,
    ),
    false,
  );
});

test("historyItem: the signed-in administrator is «Vos», saves without changes are left out", () => {
  const mine = historyItem(
    entry(0, {
      changes: [
        {
          field: "contact.whatsappNumber",
          before: "+59899000111",
          after: "+59891345454",
        },
      ],
    }),
    "ADMIN@piuma.uy",
    NOW,
  );
  assert.equal(mine?.who, "Vos");
  assert.equal(mine?.what, "cambiaste el WhatsApp");
  assert.equal(historyItem(entry(0, { changes: [] }), null, NOW), null);
  const limits = historyItem(
    entry(0, {
      changedByEmail: null,
      changes: [
        { field: "transfer.holdHours" },
        { field: "card" },
        { field: "orders" },
      ],
    }),
    null,
    NOW,
  );
  assert.equal(limits?.who, "Alguien del equipo");
  assert.equal(limits?.what, "cambió las reservas y límites");
  assert.deepEqual(limits?.details, []);
});

test("when: today, yesterday or the date, in Montevideo time", () => {
  // NOW is 2026-10-23 12:00 in Montevideo (UTC-3).
  assert.equal(when("2026-10-23T14:40:00.000Z", NOW), "hoy a las 11:40");
  assert.equal(when("2026-10-23T02:05:00.000Z", NOW), "ayer a las 23:05");
  assert.equal(when("2026-10-20T18:40:00.000Z", NOW), "el 20/10 a las 15:40");
  assert.equal(
    when("2025-12-31T18:00:00.000Z", NOW),
    "el 31/12/2025 a las 15:00",
  );
  assert.equal(when("nope", NOW), "");
});

test("listJoin reads like Spanish", () => {
  assert.equal(listJoin(["a"]), "a");
  assert.equal(listJoin(["a", "b"]), "a y b");
  assert.equal(listJoin(["a", "b", "c"]), "a, b y c");
});

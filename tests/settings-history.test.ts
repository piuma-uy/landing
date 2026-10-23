import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bankChange,
  changeRows,
  changedBy,
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

test("changeRows: bank details masked, other fields by value or by name", () => {
  const rows = changeRows(
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
  );
  assert.deepEqual(rows, [
    {
      label: "Datos bancarios",
      values: {
        before: "Sin datos",
        after: "BROU · Caja de ahorro · •••• 4567 · Piuma SAS · UYU",
      },
    },
    {
      label: "WhatsApp de Piuma",
      values: { before: "Sin número", after: "+59899123456" },
    },
    {
      label: "Mail de Piuma",
      values: { before: "a@piuma.uy", after: "b@piuma.uy" },
    },
    {
      label: "Avisos por WhatsApp",
      values: { before: "Apagados", after: "Activados" },
    },
    { label: "Envíos", values: null },
  ]);
  assert.ok(
    !JSON.stringify(rows).includes("1234567"),
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

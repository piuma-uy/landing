import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECOMMENDED,
  applySection,
  firstIncomplete,
  hoursLabel,
  isRecommended,
  localWhatsapp,
  sameForm,
  sectionForm,
  sectionIncomplete,
  sectionProblems,
  sectionStatus,
  whatsappNumber,
  zoneSummary,
  zoneWhere,
} from "../src/app/commerce/settings-form.ts";
import { shippingInput } from "../src/app/commerce/shipping.ts";
import { settingsInput, type Settings } from "../src/app/commerce/transfer.ts";

const stored = (): Settings => ({
  transfer: {
    enabled: true,
    instructions: {
      bank: "BROU",
      accountType: "Caja de ahorro",
      accountNumber: "001-1234567",
      holder: "Piuma SAS",
      currency: "UYU",
      note: "",
    },
    holdHours: 48,
  },
  card: { holdHours: 24 },
  orders: {
    maxOpenPerUser: 3,
    maxUnitsPerUser: 10,
    maxUnitsPerSku: 5,
    pendingHoldHours: 48,
  },
  contact: { whatsappNumber: "+59891345454" },
  notifications: { whatsappEnabled: false, shopEmail: "ventas@piuma.uy" },
  shipping: {
    pickup: { enabled: false, details: "" },
    delivery: {
      enabled: true,
      zones: [
        {
          id: "carrasco",
          name: "Carrasco",
          priceMinor: 0,
          leadTime: "24 a 72 h",
          pricing: "fixed",
          department: "Montevideo",
          places: ["Carrasco"],
        },
        {
          id: "centro",
          name: "Centro",
          priceMinor: 25000,
          leadTime: "",
          pricing: "fixed",
          note: "Por cadete",
          department: "Montevideo",
          places: ["Centro"],
        },
        {
          id: "interior",
          name: "Interior",
          priceMinor: 0,
          leadTime: "",
          pricing: "coordinate",
          department: null,
          places: [],
        },
      ],
      freeFromMinor: 300000,
    },
  },
  version: 7,
  updatedAt: "2026-10-26T16:44:16.075Z",
  updatedBy: "sub-123",
});

test("WhatsApp: Piuma types the local number, the API gets E.164", () => {
  assert.equal(whatsappNumber("91 345 454"), "+59891345454");
  assert.equal(whatsappNumber("091345454"), "+59891345454");
  assert.equal(whatsappNumber("+598 91 345 454"), "+59891345454");
  assert.equal(whatsappNumber("+54 9 11 2345 6789"), "+5491123456789");
  assert.equal(whatsappNumber("9134545"), null);
  assert.equal(whatsappNumber("hola"), null);
  assert.equal(whatsappNumber("  "), null);
  assert.equal(localWhatsapp("+59891345454"), "91 345 454");
  assert.equal(localWhatsapp("+5491123456789"), "+5491123456789");
  assert.equal(localWhatsapp(null), "");
});

test("sections show pesos and plain choices, and go back as the same settings", () => {
  const s = stored();
  const shipping = sectionForm("shipping", s);
  assert.deepEqual(
    shipping.zones.map((z) => [z.cost, z.price]),
    [
      ["free", null],
      ["paid", 250],
      ["coordinate", null],
    ],
  );
  assert.equal(shipping.freeFrom, 3000);
  assert.equal(sectionForm("contact", s).whatsapp, "91 345 454");
  for (const id of ["pay", "contact", "shipping", "limits"] as const) {
    const back = applySection(id, sectionForm(id, s), s);
    assert.deepEqual(
      settingsInput({ ...back, shipping: shippingInput(back.shipping) }),
      settingsInput({ ...s, shipping: shippingInput(s.shipping) }),
      id,
    );
  }
});

test("saving one section leaves the others as stored", () => {
  const s = stored();
  const contact = sectionForm("contact", s);
  contact.whatsapp = "099 000 111";
  contact.shopEmail = "  ";
  const next = applySection("contact", contact, s);
  assert.equal(next.contact.whatsappNumber, "+59899000111");
  assert.equal(next.notifications.shopEmail, null);
  assert.deepEqual(next.transfer, s.transfer);
  assert.deepEqual(next.shipping, s.shipping);
  assert.equal(
    s.contact.whatsappNumber,
    "+59891345454",
    "stored copy untouched",
  );

  const shipping = sectionForm("shipping", s);
  shipping.zones[1]!.price = 199.5;
  shipping.zones[0]!.cost = "coordinate";
  shipping.freeFrom = null;
  const zones = applySection("shipping", shipping, s).shipping.delivery;
  assert.equal(zones.zones[1]!.priceMinor, 19950);
  assert.equal(zones.zones[0]!.pricing, "coordinate");
  assert.equal(zones.freeFromMinor, null);

  const limits = sectionForm("limits", s);
  limits.transferHold = 72;
  limits.maxUnitsSku = 2;
  const l = applySection("limits", limits, s);
  assert.equal(l.transfer.holdHours, 72);
  assert.equal(l.orders.maxUnitsPerSku, 2);
  assert.deepEqual(l.transfer.instructions, s.transfer.instructions);
});

test("an API without unit limits keeps omitting them", () => {
  const s = stored();
  delete s.orders.maxUnitsPerUser;
  delete s.orders.maxUnitsPerSku;
  const f = sectionForm("limits", s);
  assert.equal("maxUnitsUser" in f, false);
  assert.deepEqual(sectionProblems("limits", f, s), {});
  assert.equal(
    "maxUnitsPerUser" in settingsInput(applySection("limits", f, s)).orders!,
    false,
  );
});

test("problems in plain words, by field", () => {
  const s = stored();
  const pay = { ...sectionForm("pay", s), bank: " ", currency: "USD" };
  assert.deepEqual(Object.keys(sectionProblems("pay", pay, s)), [
    "bank",
    "currency",
  ]);
  // Off, an incomplete account can be saved; the number still has to be a number.
  assert.deepEqual(
    sectionProblems(
      "pay",
      { ...pay, enabled: false, accountNumber: "12#4" },
      s,
    ),
    { accountNumber: "Usá sólo números, letras, guiones o puntos." },
  );
  const noWhatsapp = { ...s, contact: { whatsappNumber: null } };
  assert.match(
    sectionProblems("pay", sectionForm("pay", s), noWhatsapp)["enabled"]!,
    /guardá tu WhatsApp/,
  );

  const contact = sectionForm("contact", s);
  assert.deepEqual(sectionProblems("contact", contact, s), {});
  assert.match(
    sectionProblems("contact", { ...contact, whatsapp: "" }, s)["whatsapp"]!,
    /no puede quedar vacío/,
  );
  assert.match(
    sectionProblems(
      "contact",
      { ...contact, whatsapp: "123", shopEmail: "a@b" },
      s,
    )["whatsapp"]!,
    /8 números/,
  );
  assert.ok(
    sectionProblems("contact", { ...contact, shopEmail: "a@b" }, s)[
      "shopEmail"
    ],
  );

  const shipping = sectionForm("shipping", s);
  assert.deepEqual(sectionProblems("shipping", shipping, s), {});
  shipping.zones[1]!.price = 0;
  shipping.zones[2]!.name = "";
  assert.deepEqual(Object.keys(sectionProblems("shipping", shipping, s)), [
    "zone1.price",
    "zone2.name",
  ]);
  assert.deepEqual(
    Object.keys(
      sectionProblems(
        "shipping",
        {
          ...shipping,
          pickupEnabled: false,
          deliveryEnabled: false,
          zones: [],
        },
        s,
      ),
    ),
    ["methods"],
  );
  assert.ok(
    sectionProblems("shipping", { ...shipping, zones: [] }, s)["zones"],
  );

  const limits = {
    ...sectionForm("limits", s),
    cardHold: 0,
    maxOpen: 2.5,
    maxUnitsSku: null,
  };
  assert.deepEqual(sectionProblems("limits", limits, s), {
    cardHold: "Entre 1 y 720 horas (30 días).",
    maxOpen: "Escribí un número entero.",
    maxUnitsSku: "Escribí un número entero.",
  });
});

test("dirty check, hours and zone lines", () => {
  const s = stored();
  assert.ok(sameForm(sectionForm("pay", s), sectionForm("pay", stored())));
  assert.ok(
    !sameForm(sectionForm("pay", s), {
      ...sectionForm("pay", s),
      holder: "Otro",
    }),
  );
  assert.equal(hoursLabel(RECOMMENDED.transferHold), "48 horas = 2 días");
  assert.equal(hoursLabel(30), "30 horas = 1 día y 6 horas");
  assert.equal(hoursLabel(25), "25 horas = 1 día y 1 hora");
  assert.equal(hoursLabel(1), "1 hora");
  assert.equal(hoursLabel(null), "");
  const money = (minor: number) => `$ ${minor / 100}`;
  const [free, paid, coordinate] = sectionForm("shipping", s).zones;
  assert.equal(zoneSummary(free!, money), "Gratis · Montevideo: Carrasco · 24 a 72 h");
  assert.equal(zoneSummary(paid!, money), "$ 250 · Montevideo: Centro");
  assert.equal(zoneSummary(coordinate!, money), "A coordinar por WhatsApp · Resto del país");
});

test("folded sections say what they have stored, in one line (T66)", () => {
  const s = stored();
  const money = (minor: number) => `$ ${minor / 100}`;
  const line = (id: Parameters<typeof sectionForm>[0], st = s) =>
    sectionStatus(id, sectionForm(id, st), money);
  assert.equal(
    line("pay"),
    "Transferencia activa · BROU · cuenta terminada en 4567",
  );
  assert.equal(
    line("contact"),
    "WhatsApp +598 91 345 454 · mail ventas@piuma.uy",
  );
  assert.equal(line("shipping"), "Envío a 3 zonas · gratis desde $ 3000");
  assert.equal(
    line("limits"),
    "Valores recomendados · 48 h por transferencia · 24 h con tarjeta · hasta 3 pedidos sin pagar",
  );

  const other = stored();
  other.transfer.enabled = false;
  other.transfer.instructions.bank = "";
  other.contact.whatsappNumber = null;
  other.notifications.shopEmail = null;
  other.shipping.pickup.enabled = true;
  other.shipping.delivery.freeFromMinor = null;
  other.shipping.delivery.zones = Array.from({ length: 5 }, (_, i) => ({
    id: `z${i}`,
    name: `Zona ${i}`,
    priceMinor: 0,
    leadTime: "24-72 h",
    pricing: "fixed" as const,
  }));
  other.orders.maxOpenPerUser = 1;
  assert.equal(
    line("pay", other),
    "Transferencia apagada · faltan datos de la cuenta",
  );
  assert.equal(line("contact", other), "Sin WhatsApp · sin mail");
  assert.equal(
    line("shipping", other),
    "Retiro · Envío gratis en 5 zonas · 24-72 h",
  );
  assert.equal(
    line("limits", other),
    "48 h por transferencia · 24 h con tarjeta · hasta 1 pedido sin pagar",
  );
  other.shipping.pickup.enabled = false;
  other.shipping.delivery.enabled = false;
  assert.equal(line("shipping", other), "Sin retiro ni envíos");
  other.shipping.delivery.enabled = true;
  other.shipping.delivery.zones = [];
  assert.equal(line("shipping", other), "Envíos sin zonas");
  const abroad = stored();
  abroad.contact.whatsappNumber = "+5491123456789";
  assert.match(line("contact", abroad), /^WhatsApp \+5491123456789 · /);
});

test("only the first section with incomplete data opens alone (T66)", () => {
  const s = stored();
  assert.equal(firstIncomplete(s), null);
  for (const id of ["pay", "contact", "shipping", "limits"] as const)
    assert.equal(sectionIncomplete(id, s), false);
  assert.ok(isRecommended(sectionForm("limits", s)));

  // Transfer off is a choice, missing bank details are not.
  const off = stored();
  off.transfer.enabled = false;
  assert.equal(firstIncomplete(off), null);
  off.transfer.instructions.holder = "";
  assert.equal(firstIncomplete(off), "pay");

  // Without a mail the contact section opens, not the pay one that also needs the WhatsApp.
  const noMail = stored();
  noMail.notifications.shopEmail = null;
  assert.equal(firstIncomplete(noMail), "contact");
  const noWhatsapp = stored();
  noWhatsapp.transfer.enabled = false;
  noWhatsapp.contact.whatsappNumber = null;
  assert.equal(firstIncomplete(noWhatsapp), "contact");

  const noZones = stored();
  noZones.shipping.delivery.zones = [];
  assert.equal(firstIncomplete(noZones), "shipping");
  noZones.notifications.shopEmail = null;
  assert.equal(firstIncomplete(noZones), "contact");

  const limits = stored();
  limits.orders.maxOpenPerUser = 50;
  assert.equal(firstIncomplete(limits), "limits");
  assert.ok(!isRecommended(sectionForm("limits", limits)));
});

test("each zone declares its department and places; one owner per place (T73)", () => {
  const s = stored();
  const shipping = sectionForm("shipping", s);
  assert.deepEqual(
    shipping.zones.map((z) => [z.department, z.places]),
    [
      ["Montevideo", "Carrasco"],
      ["Montevideo", "Centro"],
      ["", ""],
    ],
  );
  // An API from before T73 sends no area: it is read from the zone name.
  const legacy = structuredClone(s);
  for (const z of legacy.shipping.delivery.zones) {
    delete z.department;
    delete z.places;
  }
  assert.deepEqual(sectionForm("shipping", legacy).zones.map((z) => z.department), [
    "Montevideo",
    "Montevideo",
    "",
  ]);
  shipping.zones[2]!.department = "Montevideo";
  shipping.zones[2]!.places = " Carrasco \n\nCordón";
  assert.deepEqual(sectionProblems("shipping", shipping, s), {
    "zone2.places": "Carrasco ya está en la zona Carrasco.",
  });
  shipping.zones[2]!.places = "Cordón\ncordon";
  assert.deepEqual(sectionProblems("shipping", shipping, s), {
    "zone2.places": "cordon está repetido.",
  });
  shipping.zones[2]!.places = "Cordón\n Parque Batlle, Villa Dolores ";
  assert.deepEqual(sectionProblems("shipping", shipping, s), {});
  const zone = applySection("shipping", shipping, s).shipping.delivery.zones[2]!;
  assert.deepEqual([zone.department, zone.places], [
    "Montevideo",
    ["Cordón", "Parque Batlle, Villa Dolores"],
  ]);
  assert.deepEqual(shippingInput(applySection("shipping", shipping, s).shipping).delivery.zones[2], {
    id: "interior",
    name: "Interior",
    priceMinor: 0,
    leadTime: "",
    pricing: "coordinate",
    department: "Montevideo",
    places: ["Cordón", "Parque Batlle, Villa Dolores"],
  });
  // Rest of the country: no places go to the API.
  shipping.zones[2]!.department = "";
  const rest = applySection("shipping", shipping, s).shipping.delivery.zones[2]!;
  assert.deepEqual([rest.department, rest.places], [null, []]);
  assert.equal(zoneWhere(shipping.zones[2]!), "Resto del país");
  assert.equal(zoneWhere({ department: "Canelones", places: "" }), "Canelones");
});

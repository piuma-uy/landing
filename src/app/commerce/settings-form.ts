// Configuración del panel by section (T62): what Piuma edits, in pesos and plain words, and how
// each section goes back into the full PUT /admin/settings. Framework-free so node --test can load it.
import { normalizeWhatsapp } from "../core/whatsapp";
import { isCoordinate, toMinor, type ShippingZone } from "./shipping";
import type { Settings } from "./transfer";

export type SectionId = "pay" | "contact" | "shipping" | "limits";
/** Field → what to fix, in the words Piuma reads under the field. */
export type Problems = Record<string, string>;

export interface PayForm {
  enabled: boolean;
  bank: string;
  accountType: string;
  accountNumber: string;
  holder: string;
  currency: string;
  note: string;
}
export interface ContactForm {
  /** As typed: "99 123 456" goes with +598; a number starting with + or 00 is kept whole. */
  whatsapp: string;
  shopEmail: string;
  whatsappAlerts: boolean;
}
export type ZoneCost = "free" | "paid" | "coordinate";
export interface ZoneForm {
  /** Blank for a new zone: shippingInput derives it from the name. */
  id: string;
  name: string;
  cost: ZoneCost;
  /** Pesos, only for "paid". */
  price: number | null;
  leadTime: string;
  note: string;
}
export interface ShippingForm {
  pickupEnabled: boolean;
  pickupDetails: string;
  deliveryEnabled: boolean;
  zones: ZoneForm[];
  /** Pesos; null without free shipping by amount. */
  freeFrom: number | null;
}
export interface LimitsForm {
  transferHold: number | null;
  cardHold: number | null;
  pendingHold: number | null;
  maxOpen: number | null;
  /** Undefined when the API predates the unit limits (the field is not shown). */
  maxUnitsUser?: number | null;
  maxUnitsSku?: number | null;
}
export interface Forms {
  pay: PayForm;
  contact: ContactForm;
  shipping: ShippingForm;
  limits: LimitsForm;
}

/** The API defaults (piuma-backend src/settings.ts), offered as "Recomendado". */
export const RECOMMENDED = {
  transferHold: 48,
  cardHold: 24,
  pendingHold: 48,
  maxOpen: 3,
  maxUnitsUser: 10,
  maxUnitsSku: 5,
} as const;
export const ACCOUNT_TYPES = ["Caja de ahorro", "Cuenta corriente"];
export const BANKS = [
  "BROU",
  "Santander",
  "Itaú",
  "BBVA",
  "Scotiabank",
  "HSBC",
  "Banco Nación Argentina",
  "Bandes",
  "Heritage",
  "Banco Hipotecario",
];
export const CURRENCIES = [
  { code: "UYU", label: "Pesos uruguayos" },
  { code: "USD", label: "Dólares" },
];
/** The shop charges in pesos: the API refuses a transfer account in another currency. */
export const SHOP_CURRENCY = "UYU";

/** "+59899123456" → "99 123 456"; other countries stay whole; empty without number. */
export function localWhatsapp(number: string | null | undefined) {
  const e164 = normalizeWhatsapp(number);
  if (!e164) return number ?? "";
  const uy = /^\+598(\d{2})(\d{3})(\d{3})$/.exec(e164);
  return uy ? `${uy[1]} ${uy[2]} ${uy[3]}` : e164;
}

/** What Piuma typed next to +598, in E.164; null when it is not a valid number. */
export function whatsappNumber(typed: string) {
  const raw = typed.trim();
  if (!raw) return null;
  if (raw.startsWith("+") || raw.startsWith("00"))
    return normalizeWhatsapp(raw);
  if (/[^\d\s().-]/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "").replace(/^0/, "");
  return /^[2-9]\d{7}$/.test(digits) ? "+598" + digits : null;
}

const pesos = (minor: number | null) => (minor === null ? null : minor / 100);
const cost = (z: Pick<ShippingZone, "pricing" | "priceMinor">): ZoneCost =>
  isCoordinate(z) ? "coordinate" : z.priceMinor ? "paid" : "free";

/** The editable copy of one section, from the stored settings. */
export function sectionForm<K extends SectionId>(id: K, s: Settings): Forms[K];
export function sectionForm(id: SectionId, s: Settings) {
  switch (id) {
    case "pay": {
      const i = s.transfer.instructions;
      return {
        enabled: s.transfer.enabled,
        bank: i.bank,
        accountType: i.accountType,
        accountNumber: i.accountNumber,
        holder: i.holder,
        currency: i.currency || SHOP_CURRENCY,
        note: i.note,
      };
    }
    case "contact":
      return {
        whatsapp: localWhatsapp(s.contact.whatsappNumber),
        shopEmail: s.notifications.shopEmail ?? "",
        whatsappAlerts: s.notifications.whatsappEnabled,
      };
    case "shipping":
      return {
        pickupEnabled: s.shipping.pickup.enabled,
        pickupDetails: s.shipping.pickup.details,
        deliveryEnabled: s.shipping.delivery.enabled,
        zones: s.shipping.delivery.zones.map((z) => ({
          id: z.id,
          name: z.name,
          cost: cost(z),
          price: cost(z) === "paid" ? pesos(z.priceMinor) : null,
          leadTime: z.leadTime,
          note: z.note ?? "",
        })),
        freeFrom: pesos(s.shipping.delivery.freeFromMinor),
      };
    case "limits":
      return {
        transferHold: s.transfer.holdHours,
        cardHold: s.card.holdHours,
        pendingHold: s.orders.pendingHoldHours,
        maxOpen: s.orders.maxOpenPerUser,
        ...(s.orders.maxUnitsPerUser !== undefined
          ? { maxUnitsUser: s.orders.maxUnitsPerUser }
          : {}),
        ...(s.orders.maxUnitsPerSku !== undefined
          ? { maxUnitsSku: s.orders.maxUnitsPerSku }
          : {}),
      };
  }
}

/** Same content, whatever the typing (a number typed as text, spaces around words). */
export function sameForm(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The stored settings with one section replaced by the form. Only valid forms come here
 * (sectionProblems empty); the rest of the settings goes back as the server sent it.
 */
export function applySection<K extends SectionId>(
  id: K,
  form: Forms[K],
  s: Settings,
): Settings {
  const next = structuredClone(s);
  if (id === "pay") {
    const f = form as PayForm;
    next.transfer.enabled = f.enabled;
    next.transfer.instructions = {
      bank: f.bank.trim(),
      accountType: f.accountType.trim(),
      accountNumber: f.accountNumber.trim(),
      holder: f.holder.trim(),
      currency: f.currency,
      note: f.note.trim(),
    };
  } else if (id === "contact") {
    const f = form as ContactForm;
    next.contact.whatsappNumber = whatsappNumber(f.whatsapp);
    next.notifications.shopEmail = f.shopEmail.trim() || null;
    next.notifications.whatsappEnabled = f.whatsappAlerts;
  } else if (id === "shipping") {
    const f = form as ShippingForm;
    next.shipping = {
      pickup: { enabled: f.pickupEnabled, details: f.pickupDetails },
      delivery: {
        enabled: f.deliveryEnabled,
        zones: f.zones.map((z) => ({
          id: z.id,
          name: z.name,
          pricing: z.cost === "coordinate" ? "coordinate" : "fixed",
          priceMinor: z.cost === "paid" ? (toMinor(z.price) ?? 0) : 0,
          leadTime: z.leadTime,
          note: z.note,
        })),
        freeFromMinor: toMinor(f.freeFrom),
      },
    };
  } else {
    const f = form as LimitsForm;
    next.transfer.holdHours = Number(f.transferHold);
    next.card = { holdHours: Number(f.cardHold) };
    next.orders = {
      ...next.orders,
      maxOpenPerUser: Number(f.maxOpen),
      pendingHoldHours: Number(f.pendingHold),
      ...(f.maxUnitsUser !== undefined
        ? { maxUnitsPerUser: Number(f.maxUnitsUser) }
        : {}),
      ...(f.maxUnitsSku !== undefined
        ? { maxUnitsPerSku: Number(f.maxUnitsSku) }
        : {}),
    };
  }
  return next;
}

const blank = (v: string | null | undefined) => !v?.trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const between = (
  v: number | null | undefined,
  min: number,
  max: number,
  message: string,
) =>
  v === null ||
  v === undefined ||
  String(v) === "" ||
  !Number.isInteger(Number(v))
    ? "Escribí un número entero."
    : Number(v) < min || Number(v) > max
      ? message
      : "";

/**
 * What stops a section from being saved, by field. `saved` are the stored settings: transfer
 * needs the WhatsApp of the other section (the buyer sends the receipt there), and the
 * WhatsApp cannot be emptied while transfer is on.
 */
export function sectionProblems<K extends SectionId>(
  id: K,
  form: Forms[K],
  saved: Settings,
): Problems {
  const p: Problems = {};
  if (id === "pay") {
    const f = form as PayForm;
    if (!/^[0-9A-Za-z ./-]*$/.test(f.accountNumber.trim()))
      p["accountNumber"] = "Usá sólo números, letras, guiones o puntos.";
    if (f.enabled) {
      const need = "Completalo para aceptar transferencias.";
      if (blank(f.bank)) p["bank"] = need;
      if (blank(f.accountType)) p["accountType"] = need;
      if (blank(f.accountNumber)) p["accountNumber"] ??= need;
      if (blank(f.holder)) p["holder"] = need;
      if (f.currency !== SHOP_CURRENCY)
        p["currency"] =
          "La tienda cobra en pesos: la cuenta tiene que ser en pesos uruguayos.";
      if (!saved.contact.whatsappNumber)
        p["enabled"] =
          "Primero guardá tu WhatsApp en «Tu WhatsApp y tu mail»: ahí te mandan el comprobante.";
    }
  } else if (id === "contact") {
    const f = form as ContactForm;
    if (!blank(f.whatsapp) && !whatsappNumber(f.whatsapp))
      p["whatsapp"] =
        "Revisá el número: son 8 números, por ejemplo 99 123 456.";
    else if (blank(f.whatsapp) && saved.transfer.enabled)
      p["whatsapp"] =
        "Mientras aceptes transferencias tu WhatsApp no puede quedar vacío.";
    if (!blank(f.shopEmail) && !EMAIL.test(f.shopEmail.trim()))
      p["shopEmail"] = "Revisá el mail, por ejemplo hola@piuma.com.uy.";
  } else if (id === "shipping") {
    const f = form as ShippingForm;
    if (!f.pickupEnabled && !f.deliveryEnabled)
      p["methods"] =
        "Activá el retiro o los envíos: si no, nadie puede recibir su compra.";
    if (f.deliveryEnabled && !f.zones.length)
      p["zones"] = "Agregá al menos una zona de envío.";
    f.zones.forEach((z, i) => {
      if (blank(z.name)) p[`zone${i}.name`] = "Poné el nombre de la zona.";
      if (z.cost === "paid" && !((toMinor(z.price) ?? 0) > 0))
        p[`zone${i}.price`] = "Poné el precio o elegí «Gratis».";
    });
    if (
      f.freeFrom !== null &&
      String(f.freeFrom) !== "" &&
      !((toMinor(f.freeFrom) ?? 0) > 0)
    )
      p["freeFrom"] = "Poné un monto mayor a 0 o dejalo vacío.";
  } else {
    const f = form as LimitsForm;
    const hours = "Entre 1 y 720 horas (30 días).";
    for (const k of ["transferHold", "cardHold", "pendingHold"] as const) {
      const m = between(f[k], 1, 720, hours);
      if (m) p[k] = m;
    }
    const open = between(f.maxOpen, 1, 20, "Entre 1 y 20 pedidos.");
    if (open) p["maxOpen"] = open;
    for (const k of ["maxUnitsUser", "maxUnitsSku"] as const)
      if (f[k] !== undefined) {
        const m = between(f[k], 1, 100, "Entre 1 y 100 unidades.");
        if (m) p[k] = m;
      }
  }
  return p;
}

/** "48 horas = 2 días", "30 horas = 1 día y 6 horas"; just "5 horas" under a day. */
export function hoursLabel(hours: number | null | undefined) {
  const h = Number(hours);
  if (!Number.isInteger(h) || h < 1) return "";
  const count = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  const text = count(h, "hora", "horas");
  if (h < 24) return text;
  const days = count(Math.floor(h / 24), "día", "días");
  return `${text} = ${days}${h % 24 ? " y " + count(h % 24, "hora", "horas") : ""}`;
}

/** One line per zone for its folded card: "Gratis · 24 a 72 h". */
export function zoneSummary(z: ZoneForm, money: (minor: number) => string) {
  const price =
    z.cost === "coordinate"
      ? "A coordinar por WhatsApp"
      : z.cost === "free"
        ? "Gratis"
        : toMinor(z.price)
          ? money(toMinor(z.price)!)
          : "Sin precio";
  return [price, z.leadTime.trim()].filter(Boolean).join(" · ");
}

export const emptyZone = (): ZoneForm => ({
  id: "",
  name: "",
  cost: "free",
  price: null,
  leadTime: "",
  note: "",
});

export const SECTION_SAVED: Record<SectionId, string> = {
  pay: "Listo, guardamos cómo te pagan.",
  contact: "Listo, guardamos tu WhatsApp y tu mail.",
  shipping: "Listo, guardamos los envíos y el retiro.",
  limits: "Listo, guardamos las reservas y los límites.",
};
/** Someone saved this same section while Piuma was editing it: the form shows what is stored. */
export const SECTION_CONFLICT =
  "Mientras editabas, otra persona guardó cambios en esta sección. Te mostramos cómo quedó: revisalo y, si hace falta, volvé a hacer tu cambio.";

/** True when the limits are the API defaults (units only when the API has them). */
export function isRecommended(f: LimitsForm) {
  return (
    f.transferHold === RECOMMENDED.transferHold &&
    f.cardHold === RECOMMENDED.cardHold &&
    f.pendingHold === RECOMMENDED.pendingHold &&
    f.maxOpen === RECOMMENDED.maxOpen &&
    (f.maxUnitsUser === undefined ||
      f.maxUnitsUser === RECOMMENDED.maxUnitsUser) &&
    (f.maxUnitsSku === undefined || f.maxUnitsSku === RECOMMENDED.maxUnitsSku)
  );
}

export const SECTIONS: readonly SectionId[] = [
  "pay",
  "contact",
  "shipping",
  "limits",
];

/**
 * Stored data that still needs Piuma (T66): the bank details transfer would need, a WhatsApp
 * and a mail, or anything the section could not be saved with as it is.
 */
export function sectionIncomplete(id: SectionId, s: Settings) {
  if (id === "pay") {
    // Off is a choice; missing bank details are not. The WhatsApp is said in its own section.
    const f = { ...sectionForm("pay", s), enabled: true };
    return Object.keys(sectionProblems("pay", f, s)).some(
      (k) => k !== "enabled",
    );
  }
  if (id === "contact") {
    const f = sectionForm("contact", s);
    if (blank(f.whatsapp) || blank(f.shopEmail)) return true;
  }
  return Object.keys(sectionProblems(id, sectionForm(id, s), s)).length > 0;
}

/** The section that opens on its own: the first one with something missing, or none. */
export function firstIncomplete(s: Settings): SectionId | null {
  return SECTIONS.find((id) => sectionIncomplete(id, s)) ?? null;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** "+598 99 123 456" for a number from Uruguay, E.164 for the rest. */
function whatsappLabel(typed: string) {
  const e164 = whatsappNumber(typed);
  if (!e164) return "";
  return e164.startsWith("+598") ? "+598 " + localWhatsapp(e164) : e164;
}

/**
 * One line with what a folded section has stored (T66), e.g.
 * "WhatsApp +598 99 123 456 · mail ventas@piuma.uy" or "Envío gratis en 5 zonas · 24 a 72 h".
 */
export function sectionStatus<K extends SectionId>(
  id: K,
  form: Forms[K],
  money: (minor: number) => string,
): string;
export function sectionStatus(
  id: SectionId,
  form: Forms[SectionId],
  money: (minor: number) => string,
) {
  const parts: string[] = [];
  if (id === "pay") {
    const f = form as PayForm;
    const missing = [f.bank, f.accountType, f.accountNumber, f.holder].some(
      blank,
    );
    const last4 = f.accountNumber.replace(/[^0-9A-Za-z]/g, "").slice(-4);
    if (f.enabled)
      parts.push(
        "Transferencia activa",
        f.bank.trim(),
        `cuenta terminada en ${last4}`,
      );
    else
      parts.push(
        "Transferencia apagada",
        missing ? "faltan datos de la cuenta" : "",
      );
  } else if (id === "contact") {
    const f = form as ContactForm;
    const whatsapp = whatsappLabel(f.whatsapp);
    parts.push(
      whatsapp ? `WhatsApp ${whatsapp}` : "Sin WhatsApp",
      blank(f.shopEmail) ? "sin mail" : `mail ${f.shopEmail.trim()}`,
    );
  } else if (id === "shipping") {
    const f = form as ShippingForm;
    if (f.pickupEnabled) parts.push("Retiro");
    if (f.deliveryEnabled && !f.zones.length) parts.push("Envíos sin zonas");
    else if (f.deliveryEnabled) {
      const zones = plural(f.zones.length, "zona", "zonas");
      const costs = new Set(f.zones.map((z) => z.cost));
      const only = costs.size === 1 ? [...costs][0] : null;
      parts.push(
        only === "free"
          ? `Envío gratis en ${zones}`
          : only === "coordinate"
            ? `Envío a coordinar en ${zones}`
            : `Envío a ${zones}`,
      );
      const leads = new Set(f.zones.map((z) => z.leadTime.trim()));
      if (leads.size === 1) parts.push([...leads][0]!);
      const free = toMinor(f.freeFrom);
      if (free) parts.push(`gratis desde ${money(free)}`);
    }
    if (!parts.length) parts.push("Sin retiro ni envíos");
  } else {
    const f = form as LimitsForm;
    parts.push(
      isRecommended(f) ? "Valores recomendados" : "",
      `${f.transferHold} h por transferencia`,
      `${f.cardHold} h con tarjeta`,
      `hasta ${plural(Number(f.maxOpen), "pedido", "pedidos")} sin pagar`,
    );
  }
  return parts.filter(Boolean).join(" · ");
}

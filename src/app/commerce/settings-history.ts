// Settings change history (T27 contract, GET /admin/settings/history) and the bank details
// alert above the panel. Framework-free so node --test can load it.
import type { TransferInstructions } from "./transfer";

export interface SettingsChange {
  field: string;
  before?: unknown;
  after?: unknown;
}
export interface SettingsHistoryEntry {
  version: number;
  changedAt: string;
  /** Cognito sub (or local user id in Docker). */
  changedBy: string;
  changedByEmail: string | null;
  changes: SettingsChange[];
  /** Bank details, WhatsApp number or shop mail changed (and was mailed). */
  sensitive: boolean;
  shopEmail: string | null;
}
export interface SettingsHistoryPage {
  items: SettingsHistoryEntry[];
  nextCursor?: string;
}

export const BANK_FIELD = "transfer.instructions";
/** Days the bank details alert stays above the panel. */
export const ALERT_DAYS = 7;
const DAY_MS = 86_400_000;
/** Pages read at most to find a bank change of the last ALERT_DAYS (50 entries each). */
export const ALERT_MAX_PAGES = 5;

const LABELS: Record<string, string> = {
  [BANK_FIELD]: "Datos bancarios",
  "contact.whatsappNumber": "WhatsApp de Piuma",
  "notifications.shopEmail": "Mail de Piuma",
  "notifications.whatsappEnabled": "Avisos por WhatsApp",
  "transfer.enabled": "Ofrecer transferencia",
  "transfer.holdHours": "Horas de reserva por transferencia",
  card: "Pago con tarjeta",
  orders: "Pedidos sin pagar",
  shipping: "Envíos",
};

/** Account number with everything but its last 4 digits hidden: "•••• 4321". */
export function maskAccount(accountNumber: string | null | undefined) {
  const digits = (accountNumber ?? "").replace(/[^0-9A-Za-z]/g, "");
  if (!digits) return "";
  return "•••• " + digits.slice(-4);
}

function bankSummary(value: unknown) {
  const i = value as Partial<TransferInstructions> | null;
  if (!i || typeof i !== "object") return "Sin datos";
  const parts = [
    i.bank,
    i.accountType,
    maskAccount(i.accountNumber),
    i.holder,
    i.currency,
  ].filter((p): p is string => !!p && typeof p === "string");
  if (i.note) parts.push(`nota: «${i.note}»`);
  return parts.join(" · ") || "Sin datos";
}

function shown(field: string, value: unknown) {
  if (field === BANK_FIELD) return bankSummary(value);
  if (field === "notifications.whatsappEnabled")
    return value ? "Activados" : "Apagados";
  if (value === null || value === undefined || value === "")
    return field === "contact.whatsappNumber" ? "Sin número" : "Sin mail";
  return String(value);
}

/** Who made the change: the administrator mail when the API knew it. */
export function changedBy(entry: SettingsHistoryEntry) {
  return entry.changedByEmail || entry.changedBy;
}

const recent = (entry: SettingsHistoryEntry, now: number) =>
  now - new Date(entry.changedAt).getTime() < ALERT_DAYS * DAY_MS;

/** Newest bank details change of the last ALERT_DAYS days, or null. Entries come newest first. */
export function bankChange(entries: SettingsHistoryEntry[], now: number) {
  const entry = entries.find(
    (e) =>
      recent(e, now) &&
      e.sensitive &&
      e.changes.some((c) => c.field === BANK_FIELD),
  );
  return entry ? { changedAt: entry.changedAt, by: changedBy(entry) } : null;
}

/** Another page could still hold a change of the last ALERT_DAYS days (and none was found yet). */
export function needsOlder(
  entries: SettingsHistoryEntry[],
  nextCursor: string | undefined,
  now: number,
) {
  if (!nextCursor || bankChange(entries, now)) return false;
  const oldest = entries.at(-1);
  return !oldest || recent(oldest, now);
}

// Compact history (T62): one sentence per save, "Vos cambiaste el WhatsApp", with the time in
// Montevideo and, for the values the API records, a short before → after.

/** What changed, as Piuma says it; reservations and limits share one name. */
const NOUNS: Record<string, string> = {
  [BANK_FIELD]: "los datos bancarios",
  "contact.whatsappNumber": "el WhatsApp",
  "notifications.shopEmail": "el mail",
  "notifications.whatsappEnabled": "los avisos por WhatsApp",
  "transfer.enabled": "el pago por transferencia",
  "transfer.holdHours": "las reservas y límites",
  card: "las reservas y límites",
  orders: "las reservas y límites",
  shipping: "los envíos",
};
const SHORT: Record<string, string> = {
  [BANK_FIELD]: "Datos bancarios",
  "contact.whatsappNumber": "WhatsApp",
  "notifications.shopEmail": "Mail",
  "notifications.whatsappEnabled": "Avisos por WhatsApp",
};

/** "a", "a y b", "a, b y c". */
export function listJoin(items: string[]) {
  return items.length < 2
    ? (items[0] ?? "")
    : items.slice(0, -1).join(", ") + " y " + items.at(-1);
}

/** Who saved, as a name for the sentence: "Vos" for the signed-in administrator. */
export function who(entry: SettingsHistoryEntry, myEmail: string | null) {
  const email = entry.changedByEmail;
  if (email && myEmail && email.toLowerCase() === myEmail.toLowerCase())
    return { name: "Vos", me: true };
  return { name: email || "Alguien del equipo", me: false };
}

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Montevideo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const TIME = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "hoy a las 15:40", "ayer a las 9:05", "el 26/10 a las 15:40" (with the year if not this one). */
export function when(iso: string, now: number) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = DAY_KEY.format(date);
  const at = " a las " + TIME.format(date);
  if (day === DAY_KEY.format(now)) return "hoy" + at;
  if (day === DAY_KEY.format(now - DAY_MS)) return "ayer" + at;
  const [y, m, d] = day.split("-");
  return `el ${d}/${m}${y === DAY_KEY.format(now).slice(0, 4) ? "" : "/" + y}${at}`;
}

function value(field: string, v: unknown) {
  if (field === "contact.whatsappNumber" && typeof v === "string") {
    const uy = /^\+598(\d{2})(\d{3})(\d{3})$/.exec(v);
    if (uy) return `+598 ${uy[1]} ${uy[2]} ${uy[3]}`;
  }
  return shown(field, v);
}

/**
 * One save of the settings for the compact list: "Vos cambiaste el WhatsApp", when, and a short
 * before → after for the values the API keeps (account number masked). null for a save that
 * changed nothing.
 */
export function historyItem(
  entry: SettingsHistoryEntry,
  myEmail: string | null,
  now: number,
) {
  if (!entry.changes.length) return null;
  const by = who(entry, myEmail);
  const nouns = [
    ...new Set(entry.changes.map((c) => NOUNS[c.field] ?? "la configuración")),
  ];
  return {
    version: entry.version,
    who: by.name,
    what: (by.me ? "cambiaste " : "cambió ") + listJoin(nouns),
    when: when(entry.changedAt, now),
    sensitive: entry.sensitive,
    details: entry.changes.flatMap((c) =>
      "before" in c || "after" in c
        ? [
            {
              label: SHORT[c.field] ?? LABELS[c.field] ?? "Cambio",
              before: value(c.field, c.before),
              after: value(c.field, c.after),
            },
          ]
        : [],
    ),
  };
}

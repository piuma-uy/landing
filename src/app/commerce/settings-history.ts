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

/** One row per change: label and, for recorded values, before and after (account masked). */
export function changeRows(entry: SettingsHistoryEntry) {
  return entry.changes.map((c) => ({
    label: LABELS[c.field] ?? c.field,
    values:
      "before" in c || "after" in c
        ? { before: shown(c.field, c.before), after: shown(c.field, c.after) }
        : null,
  }));
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

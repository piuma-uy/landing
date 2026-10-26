// Pickup and zone delivery (T22 contract, T29 pricing). Framework-free so node --test can
// load it. The API prices shipping; the browser only sends the choice and shows what comes back.
/** fixed charges priceMinor (0 = free); coordinate charges nothing at checkout and the
 * shop arranges cost and schedule over WhatsApp. Zones saved before T29 have no pricing. */
export type ZonePricing = "fixed" | "coordinate";
export interface ShippingZone {
  id: string;
  name: string;
  priceMinor: number;
  leadTime: string;
  pricing?: ZonePricing;
  /** Shown to the buyer and kept on the order (up to 300 characters). */
  note?: string;
}
export interface ShippingSettings {
  pickup: { enabled: boolean; details: string };
  delivery: {
    enabled: boolean;
    zones: ShippingZone[];
    freeFromMinor: number | null;
  };
}
/** GET /shipping-options: what the buyer may choose. */
export interface ShippingOptions extends ShippingSettings {
  currency: string;
}
export interface Address {
  street: string;
  city: string;
  department: string;
  notes?: string;
}
/** Server-calculated shipping in a quote, and the snapshot stored on the order. */
export type ShippingQuote =
  | { method: "pickup"; priceMinor: 0; details: string }
  | {
      method: "delivery";
      zoneId: string;
      zoneName: string;
      leadTime: string;
      priceMinor: number;
      freeShipping: boolean;
      /** true: nothing charged for shipping, arranged over WhatsApp (absent before T29). */
      coordinate?: boolean;
      note?: string;
      address?: Address;
    };
export type Fulfillment =
  { method: "pickup" } | { method: "delivery"; zoneId: string };
export interface Line {
  sku: string;
  quantity: number;
}
/** Until the shop saves a policy the API offers only pickup with no details. */
export const PICKUP_FALLBACK = "Retiro a coordinar";
export const SHIPPING_CHANGED =
  "Las opciones de entrega cambiaron. Elegí de nuevo cómo recibir tu pedido.";
/** The 19 departments of Uruguay, for the address form. */
export const DEPARTMENTS = [
  "Artigas",
  "Canelones",
  "Cerro Largo",
  "Colonia",
  "Durazno",
  "Flores",
  "Florida",
  "Lavalleja",
  "Maldonado",
  "Montevideo",
  "Paysandú",
  "Río Negro",
  "Rivera",
  "Rocha",
  "Salto",
  "San José",
  "Soriano",
  "Tacuarembó",
  "Treinta y Tres",
];
export function pickupLabel(details: string | undefined) {
  return details?.trim() || PICKUP_FALLBACK;
}
export function emptyAddress(): Address {
  return { street: "", city: "", department: "Montevideo", notes: "" };
}
/** Every choice the buyer can make, pickup first. */
export function choices(options: ShippingOptions | null): Fulfillment[] {
  if (!options) return [];
  return [
    ...(options.pickup.enabled ? [{ method: "pickup" as const }] : []),
    ...(options.delivery.enabled
      ? options.delivery.zones.map((z) => ({
          method: "delivery" as const,
          zoneId: z.id,
        }))
      : []),
  ];
}
export function sameChoice(a: Fulfillment | null, b: Fulfillment | null) {
  if (!a || !b) return false;
  return a.method === "pickup"
    ? b.method === "pickup"
    : b.method === "delivery" && a.zoneId === b.zoneId;
}
/** Keeps the current choice while it is still offered; otherwise the first one. */
export function defaultChoice(
  options: ShippingOptions | null,
  current: Fulfillment | null = null,
): Fulfillment | null {
  const all = choices(options);
  return all.find((c) => sameChoice(c, current)) ?? all[0] ?? null;
}
/** POST /cart/quote body: items plus the choice, never a price. */
export function quoteBody(items: Line[], choice: Fulfillment | null) {
  if (!choice) return { items };
  return choice.method === "delivery"
    ? { items, fulfillment: "delivery", zoneId: choice.zoneId }
    : { items, fulfillment: "pickup" };
}
/** fulfillment and delivery fields of POST /orders; blank notes are left out. */
export function orderFulfillment(choice: Fulfillment, address: Address) {
  if (choice.method === "pickup") return { fulfillment: "pickup" as const };
  const notes = address.notes?.trim();
  return {
    fulfillment: "delivery" as const,
    delivery: {
      zoneId: choice.zoneId,
      address: {
        street: address.street.trim(),
        city: address.city.trim(),
        department: address.department.trim(),
        ...(notes ? { notes } : {}),
      },
    },
  };
}
/**
 * One line describing how an order is delivered, from its stored snapshot. Orders from
 * before shipping existed have none and were pickup by arrangement.
 */
export function shippingSummary(
  shipping: ShippingQuote | undefined,
  withNotes = false,
): string {
  if (!shipping || shipping.method === "pickup")
    return shipping?.details.trim()
      ? "Retiro: " + shipping.details.trim()
      : PICKUP_FALLBACK;
  const a = shipping.address;
  return (
    "Envío a " +
    shipping.zoneName +
    (a ? ` · ${a.street}, ${a.city}, ${a.department}` : "") +
    (withNotes && a?.notes ? ` (${a.notes})` : "") +
    (shipping.leadTime ? ` · ${shipping.leadTime}` : "")
  );
}
export function isCoordinate(zone: Pick<ShippingZone, "pricing">) {
  return zone.pricing === "coordinate";
}
/**
 * Checkout line under a zone: free zones (or the free-shipping threshold the API quoted)
 * say so with the lead time, coordinate zones say they are arranged over WhatsApp.
 */
export function zoneDetail(zone: ShippingZone, quotedFree = false) {
  const lead = zone.leadTime.trim();
  const head = isCoordinate(zone)
    ? "A coordinar por WhatsApp"
    : quotedFree || !zone.priceMinor
      ? "Envío gratis"
      : "";
  return [head, lead].filter(Boolean).join(" · ");
}
/**
 * What happens after the purchase of a delivery order: Piuma writes over WhatsApp to agree
 * place and schedule (and the cost, for coordinate zones). Nothing for pickup or cancelled.
 */
export function shippingFollowUp(order: {
  status: string;
  shipping?: ShippingQuote;
}) {
  const s = order.shipping;
  if (s?.method !== "delivery" || order.status === "cancelled") return "";
  const what = s.coordinate
    ? "lugar, horario y costo del envío, que no se cobra en esta compra."
    : "lugar y horario de la entrega.";
  return order.status === "paid"
    ? "Piuma te va a escribir por WhatsApp para coordinar " + what
    : "Con el pago confirmado, Piuma te escribe por WhatsApp para coordinar " +
        what;
}
/** Why the shipping section of the settings form cannot be saved yet, if anything. */
export function shippingProblem(s: ShippingSettings) {
  if (!s.pickup.enabled && !s.delivery.enabled)
    return "Habilitá el retiro o el envío a domicilio.";
  if (s.delivery.enabled && !s.delivery.zones.length)
    return "Agregá al menos una zona antes de habilitar los envíos.";
  return "";
}
/** Stable zone id derived from its name, unique among the given ids. */
export function zoneId(name: string, taken: string[]) {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 34) || "zona";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}
/** Pesos typed by the administrator to minor units; blank or invalid becomes null. */
export function toMinor(pesos: number | string | null | undefined) {
  if (pesos === null || pesos === undefined || pesos === "") return null;
  const n = Number(pesos);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
/**
 * settings.shipping for PUT /admin/settings: trims text, gives new zones (blank id) an
 * id from their name and keeps existing ids, which past orders reference. Coordinate zones
 * go with cost 0 (the API rejects any other) and blank notes are left out.
 */
export function shippingInput(s: ShippingSettings): ShippingSettings {
  const taken = s.delivery.zones.map((z) => z.id).filter(Boolean);
  return {
    pickup: { enabled: s.pickup.enabled, details: s.pickup.details.trim() },
    delivery: {
      enabled: s.delivery.enabled,
      zones: s.delivery.zones.map((z) => {
        const name = z.name.trim();
        const id = z.id || zoneId(name, taken);
        if (!z.id) taken.push(id);
        const pricing = z.pricing ?? "fixed";
        const note = z.note?.trim();
        return {
          id,
          name,
          priceMinor: pricing === "coordinate" ? 0 : z.priceMinor,
          leadTime: z.leadTime.trim(),
          pricing,
          ...(note ? { note } : {}),
        };
      }),
      freeFromMinor: s.delivery.freeFromMinor || null,
    },
  };
}

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
/**
 * Keeps the current choice while it is still offered; otherwise pickup when offered. A
 * delivery zone is never picked for the buyer: the checkout asks where to deliver (T68).
 */
export function defaultChoice(
  options: ShippingOptions | null,
  current: Fulfillment | null = null,
): Fulfillment | null {
  const all = choices(options);
  return (
    all.find((c) => sameChoice(c, current)) ??
    all.find((c) => c.method === "pickup") ??
    null
  );
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
export type DestinationGroup = "free" | "paid" | "coordinate";
/**
 * One entry of the checkout's "¿Adónde querés que te lo llevemos?" select: a zone, or one of the
 * two halves of the shop's single catch-all coordinate zone ("Otra zona / interior"), which the
 * buyer reads as "Otra zona de Montevideo" and "Interior del país" (same zoneId). city and
 * department prefill the address.
 */
export interface Destination {
  key: string;
  zoneId: string;
  label: string;
  group: DestinationGroup;
  city: string;
  department: string;
}
const GROUP_LABELS: Record<DestinationGroup, string> = {
  free: "Envío gratis",
  paid: "Con costo de envío",
  coordinate: "A coordinar por WhatsApp",
};
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
/** Places near Montevideo that belong to another department, for the address prefill. */
const LOCALITIES: Record<string, string> = {
  "ciudad de la costa": "Canelones",
  "las piedras": "Canelones",
  "la paz": "Canelones",
  pando: "Canelones",
  solymar: "Canelones",
  lagomar: "Canelones",
  "el pinar": "Canelones",
  atlantida: "Canelones",
  "punta del este": "Maldonado",
  piriapolis: "Maldonado",
};
/** Zone name as the buyer reads it: without the panel's "(a coordinar)" tag. */
export function zoneLabel(name: string) {
  return name.replace(/\s*\(a coordinar\)\s*$/i, "").trim() || name.trim();
}
/** Address a zone suggests: a neighbourhood is the city; "interior" leaves the department open. */
function zonePlace(name: string) {
  const n = fold(zoneLabel(name));
  if (/interior/.test(n)) return { city: "", department: "" };
  const department = DEPARTMENTS.find((d) => fold(d) === n);
  if (department) return { city: "", department };
  if (/montevideo|otra|resto/.test(n))
    return { city: "", department: "Montevideo" };
  return { city: zoneLabel(name), department: LOCALITIES[n] ?? "Montevideo" };
}
export function destinations(options: ShippingOptions | null): Destination[] {
  if (!options?.delivery.enabled) return [];
  const zones = options.delivery.zones;
  const catchAll = zones.filter(isCoordinate).length === 1;
  return zones.flatMap((z): Destination[] => {
    const group: DestinationGroup = isCoordinate(z)
      ? "coordinate"
      : z.priceMinor
        ? "paid"
        : "free";
    if (group === "coordinate" && catchAll && /otra|resto|interior/.test(fold(z.name)))
      return [
        {
          key: z.id + "#montevideo",
          zoneId: z.id,
          label: "Otra zona de Montevideo",
          group,
          city: "",
          department: "Montevideo",
        },
        {
          key: z.id + "#interior",
          zoneId: z.id,
          label: "Interior del país",
          group,
          city: "",
          department: "",
        },
      ];
    return [
      { key: z.id, zoneId: z.id, label: zoneLabel(z.name), group, ...zonePlace(z.name) },
    ];
  });
}
/** Destinations in <optgroup>s: free first, then priced, then arranged over WhatsApp. */
export function destinationGroups(list: Destination[]) {
  return (["free", "paid", "coordinate"] as const)
    .map((group) => ({
      group,
      label: GROUP_LABELS[group],
      items: list.filter((d) => d.group === group),
    }))
    .filter((g) => g.items.length);
}
/**
 * The address with the new destination's city and department, except what the buyer typed
 * (anything that is not the previous destination's prefill, or the form's default).
 */
export function prefillAddress(
  address: Address,
  to: Pick<Destination, "city" | "department">,
  from: Pick<Destination, "city" | "department"> | null,
): Address {
  const was = from ?? { city: "", department: emptyAddress().department };
  const typed = (value: string, prefilled: string) =>
    !!value.trim() && value !== prefilled;
  return {
    ...address,
    city: typed(address.city, was.city) ? address.city : to.city,
    department: typed(address.department, was.department)
      ? address.department
      : to.department,
  };
}
/**
 * The one line under the select once a zone is chosen: free (or free by the threshold the API
 * quoted) and priced zones with the lead time, coordinate zones arranged over WhatsApp.
 */
export function deliveryResult(
  zone: ShippingZone,
  quotedFree = false,
  price = "",
) {
  if (isCoordinate(zone))
    return "Envío a coordinar por WhatsApp (propio o agencia); no se cobra ahora";
  const head = quotedFree || !zone.priceMinor ? "Envío gratis" : `Envío ${price}`;
  const lead = zone.leadTime.trim();
  return lead ? `${head} · llega en ${lead}` : head;
}
/**
 * The summary's shipping amount: "Sin costo" for pickup, "Gratis (Pocitos)", "A coordinar", or
 * the price and the place; "Elegí la zona" while delivery has no destination yet.
 */
export function shippingCost(
  shipping: ShippingQuote | null | undefined,
  delivering: boolean,
  place: string | null,
  price: (minor: number) => string,
) {
  if (!delivering) return "Sin costo";
  if (!place || shipping?.method !== "delivery") return "Elegí la zona";
  if (shipping.coordinate) return "A coordinar";
  const cost =
    shipping.freeShipping || !shipping.priceMinor
      ? "Gratis"
      : price(shipping.priceMinor);
  return `${cost} (${place})`;
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

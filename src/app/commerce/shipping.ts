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
  /** Where the zone delivers (T73): null is the rest of the country. Absent in zones saved
   * before T73 (the API fills it in; zoneArea reads it from the name otherwise). */
  department?: string | null;
  /** Barrios or localities of that department; empty covers all of it. */
  places?: string[];
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
/** city is the Montevideo barrio or the city/locality; unit the apartment or floor (T73). */
export interface Address {
  street: string;
  unit?: string;
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
  return { street: "", unit: "", city: "", department: "", notes: "" };
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
/** fulfillment and delivery fields of POST /orders; blank unit and notes are left out. */
export function orderFulfillment(choice: Fulfillment, address: Address) {
  if (choice.method === "pickup") return { fulfillment: "pickup" as const };
  const notes = address.notes?.trim();
  const unit = address.unit?.trim();
  return {
    fulfillment: "delivery" as const,
    delivery: {
      zoneId: choice.zoneId,
      address: {
        street: address.street.trim(),
        ...(unit ? { unit } : {}),
        city: address.city.trim(),
        department: address.department.trim(),
        ...(notes ? { notes } : {}),
      },
    },
  };
}
/** Street, number and, if given, apartment or floor. */
export function streetLine(a: Pick<Address, "street" | "unit">) {
  const unit = a.unit?.trim();
  return unit ? `${a.street}, ${unit}` : a.street;
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
    (a ? ` · ${streetLine(a)}, ${a.city}, ${a.department}` : "") +
    (withNotes && a?.notes ? ` (${a.notes})` : "") +
    (shipping.leadTime ? ` · ${shipping.leadTime}` : "")
  );
}
export function isCoordinate(zone: Pick<ShippingZone, "pricing">) {
  return zone.pricing === "coordinate";
}
export type DestinationGroup = "free" | "paid" | "coordinate";
/**
 * One entry of the checkout's "¿Adónde querés que te lo llevemos?" select (T68, T73): a zone,
 * or one of the two halves of a zone for the rest of the country ("Otra zona de Montevideo"
 * and "Interior del país", same zoneId). The place decides the address: a fixed department
 * (shown as text) or a choice among `departments`; a fixed barrio, a barrio of `places`
 * (plus "Otro") or, with neither, a city or locality typed by the buyer.
 */
export interface Destination {
  key: string;
  zoneId: string;
  label: string;
  group: DestinationGroup;
  /** Fixed department, or null when the buyer picks one of `departments`. */
  department: string | null;
  departments: string[];
  /** Fixed barrio or locality, or null. */
  place: string | null;
  /** Barrios to choose from (Montevideo); empty with no fixed place: typed locality. */
  places: string[];
}
const GROUP_LABELS: Record<DestinationGroup, string> = {
  free: "Envío gratis",
  paid: "Con costo de envío",
  coordinate: "A coordinar por WhatsApp",
};
export const MONTEVIDEO = "Montevideo";
/** The 62 barrios of Montevideo as the INE lists them (same list as the API), A to Z. */
export const MONTEVIDEO_NEIGHBORHOODS = [
  "Ciudad Vieja",
  "Centro",
  "Barrio Sur",
  "Cordón",
  "Palermo",
  "Parque Rodó",
  "Punta Carretas",
  "Pocitos",
  "Buceo",
  "Parque Batlle, Villa Dolores",
  "Malvín",
  "Malvín Norte",
  "Punta Gorda",
  "Carrasco",
  "Carrasco Norte",
  "Bañados de Carrasco",
  "Maroñas, Parque Guaraní",
  "Flor de Maroñas",
  "Las Canteras",
  "Punta de Rieles, Bella Italia",
  "Jardines del Hipódromo",
  "Ituzaingó",
  "Unión",
  "Villa Española",
  "Mercado Modelo, Bolívar",
  "Castro, Pérez Castellanos",
  "Cerrito",
  "Las Acacias",
  "Aires Puros",
  "Casavalle",
  "Piedras Blancas",
  "Manga, Toledo Chico",
  "Paso de las Duranas",
  "Peñarol, Lavalleja",
  "Cerro",
  "Casabó, Pajas Blancas",
  "La Paloma, Tomkinson",
  "La Teja",
  "Prado, Nueva Savona",
  "Capurro, Bella Vista",
  "Aguada",
  "Reducto",
  "Atahualpa",
  "Jacinto Vera",
  "La Figurita",
  "Larrañaga",
  "La Blanqueada",
  "Villa Muñoz, Retiro",
  "La Comercial",
  "Tres Cruces",
  "Brazo Oriental",
  "Sayago",
  "Conciliación",
  "Belvedere",
  "Nuevo París",
  "Tres Ombúes, Pueblo Victoria",
  "Paso de la Arena",
  "Colón Sureste, Abayubá",
  "Colón Centro y Noroeste",
  "Lezica, Melilla",
  "Villa García, Manga Rural",
  "Manga",
].sort((a, b) => a.localeCompare(b, "es"));
/** The barrio select's way out: the buyer types it. */
export const OTHER_PLACE = "__otro__";
export const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
/** Zone name as the buyer reads it: without the panel's "(a coordinar)" tag. */
export function zoneLabel(name: string) {
  return name.replace(/\s*\(a coordinar\)\s*$/i, "").trim() || name.trim();
}
/** Where a zone delivers: declared (T73) or, for an API from before, read from the name as
 * the API does (a barrio, Ciudad de la Costa, a department, "... Montevideo", else anywhere). */
export function zoneArea(zone: Pick<ShippingZone, "name" | "department" | "places">): {
  department: string | null;
  places: string[];
} {
  if (zone.department !== undefined)
    return { department: zone.department, places: zone.department ? (zone.places ?? []) : [] };
  const label = zoneLabel(zone.name);
  const n = fold(label);
  const barrio = MONTEVIDEO_NEIGHBORHOODS.find((b) => fold(b) === n);
  if (barrio) return { department: MONTEVIDEO, places: [barrio] };
  if (n === "ciudad de la costa") return { department: "Canelones", places: [label] };
  const department = DEPARTMENTS.find((d) => fold(d) === n);
  if (department) return { department, places: [] };
  if (/montevideo/.test(n) && !/interior/.test(n)) return { department: MONTEVIDEO, places: [] };
  return { department: null, places: [] };
}
const groupOf = (z: ShippingZone): DestinationGroup =>
  isCoordinate(z) ? "coordinate" : z.priceMinor ? "paid" : "free";
export function destinations(options: ShippingOptions | null): Destination[] {
  if (!options?.delivery.enabled) return [];
  const zones = options.delivery.zones.map((z) => ({ zone: z, ...zoneArea(z) }));
  // Barrios and whole departments with a zone of their own are not offered elsewhere.
  const taken = new Set(
    zones.filter((z) => z.department === MONTEVIDEO).flatMap((z) => z.places.map(fold)),
  );
  const whole = new Set(zones.filter((z) => z.department && !z.places.length).map((z) => z.department));
  const barrios = MONTEVIDEO_NEIGHBORHOODS.filter((b) => !taken.has(fold(b)));
  const rest = zones.filter((z) => !z.department).length;
  return zones.flatMap(({ zone, department, places }): Destination[] => {
    const base = { zoneId: zone.id, label: zoneLabel(zone.name), group: groupOf(zone), departments: [] as string[] };
    if (department)
      return [
        {
          ...base,
          key: zone.id,
          department,
          place: places.length === 1 ? places[0]! : null,
          places:
            places.length > 1
              ? [...places].sort((a, b) => a.localeCompare(b, "es"))
              : !places.length && department === MONTEVIDEO
                ? barrios
                : [],
        },
      ];
    // Split in two only while Montevideo has no zone of its own; one half keeps the zone name.
    const split = !whole.has(MONTEVIDEO);
    const halves: Destination[] = [];
    if (split)
      halves.push({
        ...base,
        key: zone.id + "#montevideo",
        label: rest === 1 ? "Otra zona de Montevideo" : `${base.label} · Montevideo`,
        department: MONTEVIDEO,
        place: null,
        places: barrios,
      });
    halves.push({
      ...base,
      key: zone.id + "#interior",
      label: !split ? base.label : rest === 1 ? "Interior del país" : `${base.label} · interior`,
      department: null,
      departments: DEPARTMENTS.filter((d) => d !== MONTEVIDEO && !whole.has(d)),
      place: null,
      places: [],
    });
    return halves;
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
 * The address for a newly chosen place: its fixed department and barrio; a department the
 * buyer picked while still offered; the barrio or locality typed while the department and
 * the kind of field stay the same. Street, unit and notes are kept.
 */
export function addressFor(address: Address, to: Destination, from: Destination | null): Address {
  const department =
    to.department ?? (to.departments.includes(address.department) ? address.department : "");
  const keep =
    !!from &&
    !from.place &&
    !to.place &&
    department === address.department &&
    (to.places.length ? to.places.includes(address.city) : !from.places.length);
  return { ...address, department, city: to.place ?? (keep ? address.city : "") };
}
/**
 * What the API answers with 409 ADDRESS_ZONE_MISMATCH, checked before sending: the address
 * must be in the zone (department, one of its places) and not in a place or department with
 * a zone of its own. "" when coherent or still incomplete.
 */
export function addressMismatch(
  options: ShippingOptions | null,
  zoneId: string,
  address: Pick<Address, "city" | "department">,
): string {
  const zones = (options?.delivery.zones ?? []).map((z) => ({ zone: z, ...zoneArea(z) }));
  const chosen = zones.find((z) => z.zone.id === zoneId);
  const city = fold(address.city);
  if (!chosen || !address.department || !city) return "";
  const label = zoneLabel(chosen.zone.name);
  if (chosen.department && address.department !== chosen.department)
    return `${label} queda en ${chosen.department}: corregí el departamento o elegí otra zona.`;
  if (chosen.places.length)
    return chosen.places.some((p) => fold(p) === city)
      ? ""
      : `Con ${label} el envío es a ${chosen.places.join(", ")}: corregí el barrio o elegí otra zona.`;
  const own = zones.find(
    (o) =>
      o !== chosen &&
      o.department === address.department &&
      (o.places.length ? o.places.some((p) => fold(p) === city) : !chosen.department),
  );
  if (!own) return "";
  const where = own.places.length ? address.city.trim() : address.department;
  const free = !isCoordinate(own.zone) && !own.zone.priceMinor ? " con envío gratis" : "";
  return `${where} tiene su propia zona${free}: elegí ${zoneLabel(own.zone.name)} en «¿Adónde querés que te lo llevemos?».`;
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
        const department = z.department === undefined ? undefined : z.department || null;
        return {
          id,
          name,
          priceMinor: pricing === "coordinate" ? 0 : z.priceMinor,
          leadTime: z.leadTime.trim(),
          pricing,
          ...(note ? { note } : {}),
          // Sent as declared; a panel from before T73 leaves it out and the API reads the name.
          ...(department !== undefined
            ? {
                department,
                places: department
                  ? (z.places ?? []).map((p) => p.trim()).filter(Boolean)
                  : [],
              }
            : {}),
        };
      }),
      freeFromMinor: s.delivery.freeFromMinor || null,
    },
  };
}

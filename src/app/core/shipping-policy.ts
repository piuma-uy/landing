/**
 * Política de envíos que se muestra en /envios/, en la ficha de producto y en el checkout. La arma
 * GET /shipping-options cuando la tienda está conectada; el prerender (sin API) y la tienda sin
 * política guardada usan FALLBACK_POLICY, que es la que pasó Piuma (T29, zonas y envío gratis desde
 * $ 3.000 actualizados en T91). Sin Angular: lo importa
 * scripts/seo.ts.
 */
import type { ShippingOptions, ShippingZone } from "../commerce/shipping";

export const SHIPPING_PATH = "/envios/";

export interface ShippingPolicy {
  leadTime: string;
  freeZones: string[];
  /** Las zonas gratis por departamento (T73): "Montevideo: Carrasco, Pocitos y Ciudad Vieja". */
  freeAreas: string[];
  /** Zonas con costo fijo, con el precio ya formateado. */
  paidZones: { name: string; price: string }[];
  /** Hay zonas que se coordinan por WhatsApp (resto de Montevideo e interior). */
  coordinate: boolean;
  /** Detalle del retiro; null si no se ofrece. */
  pickup: string | null;
  /** "Envío gratis en compras desde …", ya formateado; null si no aplica. */
  freeFrom: string | null;
}

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("es-UY", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    minor / 100,
  );

export const FALLBACK_POLICY: ShippingPolicy = {
  leadTime: "24 a 72 h",
  freeZones: [
    "Carrasco",
    "Pocitos",
    "Punta Carretas",
    "Ciudad Vieja",
    "Cordón",
    "Malvín",
    "Parque Rodó",
    "Centro",
    "Parque Miramar",
    "Ciudad de la Costa",
  ],
  freeAreas: [
    "Montevideo: Carrasco, Pocitos, Punta Carretas, Ciudad Vieja, Cordón, Malvín, Parque Rodó y Centro",
    "Canelones: Parque Miramar y Ciudad de la Costa",
  ],
  paidZones: [],
  coordinate: true,
  pickup: null,
  freeFrom: money(300000, "UYU"),
};

export const isShippingPath = (path: string) => /^\/envios\/?$/.test(path);

/** "a, b y c". */
export const list = (items: string[]) =>
  items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;

const zoneLabel = (name: string) => name.replace(/\s*\(a coordinar\)\s*$/i, "").trim();

/**
 * Zonas agrupadas por departamento, en el orden en que la tienda las cargó. El API declara el
 * departamento y los barrios de cada zona (T73); sin ellos, la zona va por su nombre.
 */
function byDepartment(zones: ShippingZone[]) {
  const groups = new Map<string, string[]>();
  for (const z of zones) {
    const department = z.department ?? null;
    const places = (department && z.places) || [];
    const key = department ?? "";
    const names = places.length ? places : [zoneLabel(z.name)];
    groups.set(key, [...(groups.get(key) ?? []), ...(department && !places.length ? [] : names)]);
  }
  return [...groups].map(([department, names]) =>
    !department ? list(names) : names.length ? `${department}: ${list(names)}` : `Todo ${department}`,
  );
}

/** La política a partir de lo que ofrece el API; sin política guardada, la de Piuma. */
export function shippingPolicy(options: ShippingOptions | null): ShippingPolicy {
  if (!options || (!options.delivery.enabled && !options.pickup.details.trim()))
    return FALLBACK_POLICY;
  const zones = options.delivery.enabled ? options.delivery.zones : [];
  const fixed = zones.filter((z) => z.pricing !== "coordinate");
  const leads = zones.map((z) => z.leadTime.trim()).filter(Boolean);
  // El plazo que más se repite entre las zonas.
  const leadTime =
    leads.sort((a, b) => leads.filter((l) => l === b).length - leads.filter((l) => l === a).length)[0] ??
    "";
  return {
    leadTime,
    freeZones: fixed.filter((z) => !z.priceMinor).map((z) => zoneLabel(z.name)),
    freeAreas: byDepartment(fixed.filter((z) => !z.priceMinor)),
    paidZones: fixed.filter((z) => z.priceMinor).map((z) => {
      const name = zoneLabel(z.name);
      const department = z.department;
      return {
        name: department && department !== name ? `${name} (${department})` : name,
        price: money(z.priceMinor, options.currency),
      };
    }),
    coordinate: zones.some((z) => z.pricing === "coordinate"),
    pickup: options.pickup.enabled ? options.pickup.details.trim() || "Retiro a coordinar" : null,
    freeFrom:
      options.delivery.enabled && options.delivery.freeFromMinor
        ? money(options.delivery.freeFromMinor, options.currency)
        : null,
  };
}

/** Una línea para la ficha de producto: "Envío gratis en Carrasco, Pocitos y más". */
export function policyTeaser(policy: ShippingPolicy): string {
  const [a, b, ...rest] = policy.freeZones;
  if (!a) return policy.leadTime ? `Envíos en ${policy.leadTime}` : "Envíos a todo el país";
  if (!b) return `Envío gratis en ${a}`;
  return rest.length ? `Envío gratis en ${a}, ${b} y más` : `Envío gratis en ${a} y ${b}`;
}

export interface PolicySection {
  title: string;
  text: string;
  /** Lista corta (zonas) debajo del texto. */
  items?: string[];
}

/** El contenido de /envios/, igual en la app y en el HTML prerenderizado. */
export function policySections(policy: ShippingPolicy): PolicySection[] {
  const sections: PolicySection[] = [];
  if (policy.leadTime)
    sections.push({
      title: "Cuánto tarda",
      text: `Tu pedido llega en ${policy.leadTime} desde que se confirma el pago.`,
    });
  if (policy.freeZones.length)
    sections.push({
      title: "Envío gratis",
      text: "Sin costo de envío en estas zonas:",
      items: policy.freeAreas,
    });
  if (policy.paidZones.length)
    sections.push({
      title: "Con costo de envío",
      text: "El costo se suma al total de la compra:",
      items: policy.paidZones.map((z) => `${z.name}: ${z.price}`),
    });
  if (policy.coordinate)
    sections.push({
      title: "Resto de Montevideo e interior",
      text: "Otros barrios de Montevideo y los 18 departamentos del interior. Lo coordinamos por WhatsApp.",
    });
  if (policy.freeFrom)
    sections.push({
      title: "Compras grandes",
      text: `Envío gratis en compras desde ${policy.freeFrom}.`,
    });
  if (policy.pickup)
    sections.push({ title: "Retiro", text: `También podés retirarlo sin costo: ${policy.pickup}.` });
  sections.push({
    title: "Cómo sigue",
    text: "Después de la compra te escribimos por WhatsApp para coordinar día y horario de la entrega.",
  });
  return sections;
}

/** Departamentos con envío gratis, en orden: ["Montevideo", "Canelones"] (de freeAreas, T73). */
export function freeDepartments(policy: ShippingPolicy): string[] {
  return policy.freeAreas.filter((a) => a.includes(":")).map((a) => a.slice(0, a.indexOf(":")).trim());
}

/** "Envío gratis en zonas de Montevideo y Canelones." para descripciones; "" sin zonas gratis. */
export function freeShippingLine(policy: ShippingPolicy): string {
  const departments = freeDepartments(policy);
  if (departments.length) return `Envío gratis en zonas de ${list(departments)}.`;
  return policy.freeZones.length ? `Envío gratis en ${list(policy.freeZones)}.` : "";
}

/** Title de /envios/ (≤ 60 caracteres con la marca): las zonas gratis primero, que es lo que se busca. */
export function policyTitle(policy: ShippingPolicy, brand: string): string {
  const departments = freeDepartments(policy);
  const title = departments.length
    ? `Envío gratis en zonas de ${list(departments)} | ${brand}`
    : `Envíos y entregas | ${brand}`;
  return title.length <= 60 ? title : `Envíos y entregas | ${brand}`;
}

/** Description de /envios/ para buscadores (≤ 155 caracteres): con muchas zonas, las primeras y "más". */
export function policyDescription(policy: ShippingPolicy): string {
  const zones = policy.freeZones;
  const named = zones.length > 4 ? `${zones.slice(0, 4).join(", ")} y más` : list(zones);
  const free = zones.length ? `Envío gratis en ${named}` : "Envíos";
  const lead = policy.leadTime ? `, llega en ${policy.leadTime}` : "";
  const rest = policy.coordinate ? ". Resto del país, a coordinar por WhatsApp." : ".";
  return free + lead + rest;
}

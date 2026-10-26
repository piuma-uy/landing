/**
 * Política de envíos que se muestra en /envios/, en la ficha de producto y en el checkout. La arma
 * GET /shipping-options cuando la tienda está conectada; el prerender (sin API) y la tienda sin
 * política guardada usan FALLBACK_POLICY, que es la que pasó Piuma (T29). Sin Angular: lo importa
 * scripts/seo.ts.
 */
import type { ShippingOptions } from "../commerce/shipping";

export const SHIPPING_PATH = "/envios/";

export interface ShippingPolicy {
  leadTime: string;
  freeZones: string[];
  /** Zonas con costo fijo, con el precio ya formateado. */
  paidZones: { name: string; price: string }[];
  /** Hay zonas que se coordinan por WhatsApp (resto de Montevideo e interior). */
  coordinate: boolean;
  /** Detalle del retiro; null si no se ofrece. */
  pickup: string | null;
  /** "Envío gratis en compras desde …", ya formateado; null si no aplica. */
  freeFrom: string | null;
}

export const FALLBACK_POLICY: ShippingPolicy = {
  leadTime: "24 a 72 h",
  freeZones: ["Carrasco", "Pocitos", "Punta Carretas", "Ciudad Vieja", "Ciudad de la Costa"],
  paidZones: [],
  coordinate: true,
  pickup: null,
  freeFrom: null,
};

export const isShippingPath = (path: string) => /^\/envios\/?$/.test(path);

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("es-UY", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    minor / 100,
  );

const label = (name: string) => name.replace(/\s*\(a coordinar\)\s*$/i, "").trim();

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
    freeZones: fixed.filter((z) => !z.priceMinor).map((z) => label(z.name)),
    paidZones: fixed
      .filter((z) => z.priceMinor)
      .map((z) => ({ name: label(z.name), price: money(z.priceMinor, options.currency) })),
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

const list = (items: string[]) =>
  items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;

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
      items: policy.freeZones,
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
      text:
        "Lo coordinamos por WhatsApp: envío propio o por agencia (tipo DAC). El costo se acuerda " +
        "aparte y no se cobra en la compra.",
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

/** Description de /envios/ para buscadores (≤ 155 caracteres con la política de Piuma). */
export function policyDescription(policy: ShippingPolicy): string {
  const free = policy.freeZones.length ? `Envío gratis en ${list(policy.freeZones)}` : "Envíos";
  const lead = policy.leadTime ? `, llega en ${policy.leadTime}` : "";
  const rest = policy.coordinate ? ". Resto del país, a coordinar por WhatsApp." : ".";
  return free + lead + rest;
}

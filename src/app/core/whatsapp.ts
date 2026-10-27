// WhatsApp click-to-chat links. Framework-free so node --test and the prerender can load it.
// The shop number lives once in SITE_CONFIG.whatsappNumber; the API's
// settings.contact.whatsappNumber wins when present, and a wa.me URL built by the server
// (transfer.whatsappUrl) wins over both where the API sends one.

/**
 * E.164 ("+59899123456") from what a person types: "+598 99 123 456", "00598 99 123 456",
 * "59899123456" or a Uruguayan number without country code ("099 123 456", "99 123 456").
 * null when it cannot be a WhatsApp number.
 */
export function normalizeWhatsapp(input: string | null | undefined) {
  const raw = (input ?? "").trim();
  if (!raw || /[^\d\s+().-]/.test(raw)) return null;
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    if (raw.lastIndexOf("+") !== 0) return null;
  } else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (/^0?9\d{7}$/.test(digits)) digits = "598" + digits.replace(/^0/, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? "+" + digits : null;
}

/** "+598 99 123 456" for Uruguayan mobiles; any other valid number stays in E.164. */
export function formatWhatsapp(number: string | null | undefined) {
  const e164 = normalizeWhatsapp(number);
  if (!e164) return "";
  const uy = /^\+598(9\d)(\d{3})(\d{3})$/.exec(e164);
  return uy ? `+598 ${uy[1]} ${uy[2]} ${uy[3]}` : e164;
}

/** The number links go to: the API setting when it is valid, otherwise the site default. */
export function shopWhatsapp(
  apiNumber: string | null | undefined,
  fallback: string,
) {
  return normalizeWhatsapp(apiNumber) ?? normalizeWhatsapp(fallback) ?? "";
}

/** https://wa.me/<digits>?text=<message>, or "" without a valid number. */
export function waLink(number: string, message: string) {
  const e164 = normalizeWhatsapp(number);
  return e164
    ? `https://wa.me/${e164.slice(1)}?text=${encodeURIComponent(message)}`
    : "";
}

/** A server-built link is used only when it is an https wa.me URL; anything else is dropped. */
export function safeWaUrl(url: string | null | undefined) {
  try {
    const u = new URL(url ?? "");
    return u.protocol === "https:" && u.hostname === "wa.me" ? u.href : null;
  } catch {
    return null;
  }
}

/** The server link when it is safe, else one built for the shop number. */
export function preferServer(
  serverUrl: string | null | undefined,
  number: string,
  message: string,
) {
  return safeWaUrl(serverUrl) ?? waLink(number, message);
}

// Prefilled messages: enough context that Piuma does not need to ask again.

export function generalMessage(brand: string) {
  return `¡Hola ${brand}! Quiero consultar sobre sus productos.`;
}

export function productMessage(
  brand: string,
  product: string,
  color: string,
  size: string,
  measures: string,
) {
  return (
    `¡Hola ${brand}! Quiero consultar sobre ${product}, color ${color.toLowerCase()}, ` +
    `medida ${size} (${measures}). ¿Está disponible?`
  );
}

/** The order code tells apart several orders paid with the same phone as reference (T70). */
export function receiptMessage(
  brand: string,
  order: string,
  reference: string,
  amount: string,
) {
  return order === reference
    ? `¡Hola ${brand}! Te envío el comprobante de la transferencia del pedido ${order} por ${amount}.`
    : `¡Hola ${brand}! Te envío el comprobante de la transferencia de ${amount} del pedido ${order}, con la referencia ${reference}.`;
}

export function shippingMessage(
  brand: string,
  reference: string,
  zone: string,
  address?: { street: string; unit?: string; city: string; department: string },
) {
  const where = address
    ? `, a ${[address.street, address.unit, address.city, address.department].filter((p) => p?.trim()).join(", ")}`
    : "";
  return `¡Hola ${brand}! Quiero coordinar el envío del pedido ${reference} (zona ${zone}${where}).`;
}

export function contactMessage(name: string, email: string, message: string) {
  return `Hola, soy ${name}. Mi correo es ${email}.\n\n${message}`;
}

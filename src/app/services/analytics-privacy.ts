// Privacidad de los eventos de analytics (FE-08). Sin Angular para poder testearlo con node --test.

/** Do Not Track o Global Privacy Control encendidos: no se manda nada. */
export function optedOut(nav: {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
}): boolean {
  return nav.doNotTrack === "1" || nav.globalPrivacyControl === true;
}

/** Sólo el origen del sitio que trajo la visita (sin ruta ni query); vacío si es este mismo. */
export function referrerOrigin(referrer: string, self: string): string {
  try {
    const origin = new URL(referrer).origin;
    return origin === "null" || origin === self ? "" : origin;
  } catch {
    return "";
  }
}

/**
 * Id de la visita (T97): UUIDv7 al azar que vive en sessionStorage de esta pestaña y muere al
 * cerrarla. No identifica a nadie entre visitas ni dispositivos; PostHog lo usa como distinct_id y
 * $session_id con `$process_person_profile: false` (eventos anónimos, sin perfil de persona).
 */
export function uuidv7(now: number, random: Uint8Array): string {
  const b = random.slice(0, 16);
  for (let i = 0; i < 6; i++) b[i] = Math.floor(now / 2 ** (8 * (5 - i))) & 0xff;
  b[6] = 0x70 | (b[6]! & 0x0f);
  b[8] = 0x80 | (b[8]! & 0x3f);
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Texto de un error sin datos personales: mails, números largos (teléfonos, tarjetas, cuentas,
 * códigos) y query/hash de URLs (el callback de Cognito trae code/state) se reemplazan; recortado.
 */
export function scrub(text: string, max = 300): string {
  return text
    .replace(/(https?:\/\/[^\s?#)]*)[?#][^\s)]*/g, "$1")
    .replace(/[^\s@()<>"']+@[^\s@()<>"']+\.[a-z]{2,}/gi, "[mail]")
    .replace(/\+?\d[\d\s-]{5,}\d/g, "[n]")
    .slice(0, max);
}

export interface ExceptionFrame {
  platform: "custom";
  lang: "javascript";
  function: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

/**
 * Hasta `max` frames de un stack de Chrome/Safari/Firefox, sin query ni hash en los archivos. Los
 * bundles van minificados y sin source maps publicados: alcanza para ver qué archivo y línea.
 */
export function stackFrames(
  stack: string,
  origin: string,
  max = 15,
): ExceptionFrame[] {
  const frames: ExceptionFrame[] = [];
  for (const line of stack.split("\n")) {
    const m =
      line.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/) ??
      line.match(/^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/);
    if (!m) continue;
    const file = m[2]!.replace(/[?#].*$/, "");
    frames.push({
      platform: "custom",
      lang: "javascript",
      function: scrub(m[1] || "?", 100),
      filename: file.startsWith(origin) ? file.slice(origin.length) || "/" : scrub(file, 200),
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: file.startsWith(origin),
    });
    if (frames.length === max) break;
  }
  // PostHog lists frames oldest first, like Sentry.
  return frames.reverse();
}

/** Propiedades de un `$exception` de PostHog: tipo, mensaje y stack recortados, sin datos personales. */
export function exceptionProperties(error: unknown, origin: string) {
  const e =
    error instanceof Error
      ? error
      : { name: "Error", message: typeof error === "string" ? error : "Valor no Error lanzado", stack: "" };
  const frames = stackFrames(e.stack ?? "", origin);
  return {
    $exception_list: [
      {
        type: scrub(e.name || "Error", 100),
        value: scrub(e.message || ""),
        mechanism: { handled: false, synthetic: !(error instanceof Error) },
        ...(frames.length && { stacktrace: { type: "raw", frames } }),
      },
    ],
  };
}

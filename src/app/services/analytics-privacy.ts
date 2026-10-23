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

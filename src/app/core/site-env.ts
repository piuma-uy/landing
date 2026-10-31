/**
 * Entorno del build (T99). `npm run build` lo define con SITE_ENV (prod por defecto; el deploy de
 * piuma-backend pasa dev o prod); `ng serve` y node --test no lo definen y quedan en dev, donde se
 * ven los borradores para revisarlos.
 */
import { type SiteEnv, publishedLegalPages } from "./legal-pages";

declare const PIUMA_SITE_ENV: string | undefined;

export const SITE_ENV: SiteEnv =
  typeof PIUMA_SITE_ENV !== "undefined" && PIUMA_SITE_ENV === "prod" ? "prod" : "dev";

/** Las páginas legales que este build enlaza y muestra; ver publishedLegalPages. */
export const LEGAL_LINKS = publishedLegalPages(SITE_ENV);

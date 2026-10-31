/**
 * Rutas y nombres de las páginas legales (T89), sin el texto: el pie, el checkout y CommerceService
 * los usan en el bundle inicial; el texto (core/legal.ts) va en el chunk de LegalPageComponent.
 */

/**
 * Borrador para aprobar por Guillermo y por Piuma (T89). Mientras sea true, el build de producción
 * no publica las páginas legales (T99, ver publishedLegalPages); tests/legal.test.ts impide pasarlo
 * a false mientras quede alguna marca [A CONFIRMAR] en core/legal.ts.
 */
export const LEGAL_DRAFT = true;

/** Entorno del build (SITE_ENV en npm run build; ver core/site-env.ts y scripts/prerender.ts). */
export type SiteEnv = "prod" | "dev";

export type LegalId = "privacidad" | "terminos" | "cambios";

export interface LegalPage {
  id: LegalId;
  path: string;
  /** Texto del enlace en el pie y en el checkout. */
  label: string;
}

export const LEGAL_PAGES: readonly LegalPage[] = [
  { id: "privacidad", path: "/privacidad/", label: "Política de privacidad" },
  { id: "terminos", path: "/terminos/", label: "Términos y condiciones" },
  { id: "cambios", path: "/cambios-y-devoluciones/", label: "Cambios y devoluciones" },
];

export const legalPage = (id: LegalId): LegalPage => LEGAL_PAGES.find((p) => p.id === id)!;

/**
 * Las páginas legales que se publican (T99): todas, salvo el borrador en prod, donde ninguna: sin
 * enlaces en el pie ni en el checkout, fuera del sitemap y de llms.txt, y sin prerender (la URL cae
 * en la 404). En dev se ven para revisarlas. Con LEGAL_DRAFT = false, todas en todos lados.
 */
export const publishedLegalPages = (env: SiteEnv, draft = LEGAL_DRAFT): readonly LegalPage[] =>
  draft && env === "prod" ? [] : LEGAL_PAGES;

/** La página legal de una ruta (con o sin la barra final) entre `pages`, o null. */
export function legalIdFor(pathname: string, pages: readonly LegalPage[] = LEGAL_PAGES): LegalId | null {
  const path = pathname.replace(/\/?$/, "/");
  return pages.find((p) => p.path === path)?.id ?? null;
}

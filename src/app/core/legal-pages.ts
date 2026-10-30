/**
 * Rutas y nombres de las páginas legales (T89), sin el texto: el pie, el checkout y CommerceService
 * los usan en el bundle inicial; el texto (core/legal.ts) va en el chunk de LegalPageComponent.
 */
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

/** La página legal de una ruta (con o sin la barra final), o null. */
export function legalIdFor(pathname: string): LegalId | null {
  const path = pathname.replace(/\/?$/, "/");
  return LEGAL_PAGES.find((p) => p.path === path)?.id ?? null;
}

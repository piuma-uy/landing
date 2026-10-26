/**
 * "Esta página pesó 104 kB y cargó en 0,6 s": lo que costó la visita, medido por el navegador
 * con la Performance API. No se guarda ni se manda a ningún lado; sólo se muestra en el pie.
 */

/** Lo que usa de PerformanceNavigationTiming / PerformanceResourceTiming. */
export interface NavigationCost {
  transferSize: number;
  loadEventEnd: number;
}
export interface ResourceCost {
  transferSize: number;
}

/** Por debajo de esto casi todo vino de la caché (o el navegador no informa los bytes). */
const CACHED_BYTES = 20_000;

const kB = new Intl.NumberFormat("es-UY", {
  style: "unit",
  unit: "kilobyte",
  maximumFractionDigits: 0,
});
const MB = new Intl.NumberFormat("es-UY", {
  style: "unit",
  unit: "megabyte",
  maximumFractionDigits: 1,
});
const seconds = new Intl.NumberFormat("es-UY", {
  style: "unit",
  unit: "second",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * La frase del pie, o null si la carga no terminó o el navegador no la midió. Los bytes son los
 * que bajaron por la red hasta ahora (documento, código, fuentes, fotos ya vistas); lo servido
 * desde la caché pesa 0.
 */
export function pageCostMessage(
  nav: NavigationCost | undefined,
  resources: readonly ResourceCost[],
): string | null {
  if (!nav || !(nav.loadEventEnd > 0)) return null;
  const bytes = resources.reduce(
    (sum, r) => sum + (r.transferSize || 0),
    nav.transferSize || 0,
  );
  const weight =
    bytes < 999_500 ? kB.format(bytes / 1000) : MB.format(bytes / 1_000_000);
  const time = seconds.format(Math.max(nav.loadEventEnd, 100) / 1000);
  return (
    (bytes < CACHED_BYTES
      ? `Esta página cargó en ${time}, casi toda desde la caché de tu navegador.`
      : `Esta página pesó ${weight} y cargó en ${time}.`) +
    " Lo midió tu navegador; no se guarda ni se envía."
  );
}

/**
 * Colores aproximados para los círculos del selector.
 *
 * TODO: son APROXIMACIONES visuales, no los colores reales de la tela. Ni el catálogo
 * 2026 ni la lista de precios dan códigos de color ni muestras: sólo el nombre
 * ("Beige", "Gris", "Azul", "Rosa", "Natural"). Reemplazar por los tonos reales —o por
 * una foto recortada de cada tela— cuando la marca los facilite.
 *
 * Vive en TypeScript y no en catalog.json a propósito: el JSON sólo contiene datos
 * verificables contra los PDFs.
 */
export const COLOR_SWATCHES: Record<string, string> = {
  Blanco: '#f7f4ef',
  Natural: '#e8dcc8',
  Beige: '#d9c7ae',
  Gris: '#a8a6a1',
  Azul: '#93a8be',
  Rosa: '#dcc0bc',
};

/** Tono neutro para un color que todavía no esté en el mapa. */
export const FALLBACK_SWATCH = '#d5cec5';

export function swatchFor(colorName: string): string {
  return COLOR_SWATCHES[colorName] ?? FALLBACK_SWATCH;
}

// La guía "¿Qué medida necesito?" tal como la pasó Piuma (cambios del cliente, T91). Va escrita acá
// y no leída del catálogo: la tabla del cliente es la referencia, y tests/sizes.test.ts avisa si
// el productSize de alguna variante se aparta de ella.
// Framework-free so node --test can load it.

export type GuideColumn = "sheets" | "duvetCovers" | "duvets" | "bedspreads";

export interface GuideRow {
  size: string;
  /** Medida de la cama, "90 × 190". */
  bed: string;
  /** Medida de cada producto; null cuando no se hace en esa medida. */
  sizes: Record<GuideColumn, string | null>;
}

export const GUIDE_COLUMNS: { id: GuideColumn; label: string; category: string }[] = [
  { id: "sheets", label: "Sábanas", category: "sabanas" },
  { id: "duvetCovers", label: "Fundas nórdicas", category: "fundas-nordicas" },
  { id: "duvets", label: "Acolchados", category: "acolchados" },
  { id: "bedspreads", label: "Cubrecamas", category: "cubrecamas" },
];

const row = (
  size: string,
  bed: string,
  sheets: string,
  duvetCovers: string,
  duvets: string,
  bedspreads: string | null,
): GuideRow => ({ size, bed, sizes: { sheets, duvetCovers, duvets, bedspreads } });

export const SIZE_GUIDE: GuideRow[] = [
  row("Twin", "90 × 190", "160 × 240", "160 × 240", "160 × 230", "160 × 230"),
  row("Plaza y media", "110 × 190", "180 × 240", "180 × 240", "180 × 240", "180 × 240"),
  row("Dos plazas / Full", "140 × 190", "220 × 260", "220 × 260", "220 × 240", "220 × 240"),
  row("Queen", "160 × 200", "240 × 270", "240 × 270", "240 × 260", "240 × 260"),
  row("King", "180 × 200", "280 × 270", "280 × 270", "270 × 260", null),
  row("Super King", "200 × 200", "300 × 270", "300 × 270", "300 × 260", "300 × 260"),
];

/** Fundas de almohada, debajo de la tabla. */
export const PILLOWCASE_SIZES = ["50 × 70", "50 × 90"];

/** La columna que se resalta estando dentro de una categoría. */
export function guideColumn(categoryId: string | null | undefined): GuideColumn | null {
  return GUIDE_COLUMNS.find((column) => column.category === categoryId)?.id ?? null;
}

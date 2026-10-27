/**
 * Fotos en el tamaño que pide cada pantalla (T78). Cada foto propia de producto
 * (assets/images/productos/x.webp, 800 px de ancho) tiene al lado su versión de 400 px,
 * x-400w.webp: con `srcset` y `sizes` el teléfono baja la chica para las tarjetas y las miniaturas
 * y la grande sólo donde la foto ocupa el ancho de la pantalla. Una foto nueva lleva las dos
 * (tests/photos.test.ts lo controla); una URL que no es de esa carpeta queda con su `src` sola.
 */

const PRODUCT_PHOTO = /^(assets\/images\/productos\/[a-z0-9-]+)\.webp$/;

/** `srcset` de una foto de producto propia, o null si no es una (sin versiones). */
export function photoSrcset(src: string | null | undefined): string | null {
  const match = src ? PRODUCT_PHOTO.exec(src) : null;
  if (!match || match[1]!.endsWith("-400w")) return null;
  return `${match[1]}-400w.webp 400w, ${src} 800w`;
}

/**
 * `sizes` por lugar: el ancho en pantalla de la foto según los quiebres de cada grilla
 * (src/styles/_variables.scss: 768 y 1024; contenedor de 1200 px).
 */
export const PHOTO_SIZES = {
  /** Tarjetas del catálogo: 2 columnas en el teléfono, 3 desde 768 px. */
  card: "(min-width: 1200px) 380px, (min-width: 768px) 33vw, 50vw",
  /** Foto principal de la ficha: el ancho entero en el teléfono, media ficha desde 768 px. */
  detail: "(min-width: 1200px) 560px, (min-width: 768px) 50vw, 100vw",
  /** Miniaturas de la galería, del carrito y de los pedidos (64 a 90 px). */
  thumb: "90px",
} as const;

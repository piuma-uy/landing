/**
 * Configuración central de la marca.
 * Todo lo que cambia al pasar de placeholder a datos reales vive acá.
 */
export const SITE_CONFIG = {
  brandName: 'Piuma',
  tagline: 'Ropa de cama pensada para el descanso',

  /**
   * Número de WhatsApp en formato internacional, SOLO DÍGITOS (sin +, espacios ni guiones).
   * Ejemplo actual: +598 99 999 999 → '59899999999'
   */
  whatsappNumber: '59899999999',
  /** Versión legible del mismo número, para mostrar en pantalla. */
  whatsappDisplay: '+598 99 999 999',

  email: 'hola@piuma.uy',
  instagramUrl: 'https://instagram.com/piuma',
  facebookUrl: 'https://facebook.com/piuma',

  city: 'Montevideo, Uruguay',
} as const;

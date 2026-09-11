/**
 * Configuración central de la marca.
 * Datos tomados del catálogo oficial 2026 (brand-assets/info/catalogo-2026-marzo.pdf).
 */
export const SITE_CONFIG = {
  brandName: 'Piuma',
  tagline: 'Ropa de cama pensada para el descanso',

  /**
   * Número de WhatsApp en formato internacional, SOLO DÍGITOS (sin +, espacios ni guiones).
   * El catálogo lista otros dos contactos: 092 090 406 y 099 619 407.
   */
  whatsappNumber: '59891345454',
  /** Versión legible del mismo número, para mostrar en pantalla. */
  whatsappDisplay: '091 345 454',

  email: 'distrifotosrl@gmail.com',
  instagramUrl: 'https://instagram.com/piuma_uy',
  // TODO: URL inventada — el catálogo sólo menciona Instagram. Confirmar si Piuma tiene
  // Facebook; si no, sacar 'facebook' de los [networks] en contact y footer.
  facebookUrl: 'https://facebook.com/piuma',

  city: 'Barra de Carrasco, Montevideo, Uruguay',
} as const;

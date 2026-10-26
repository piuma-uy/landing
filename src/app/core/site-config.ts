/**
 * Configuración central de la marca.
 * Datos tomados del catálogo oficial 2026 (brand-assets/info/catalogo-2026-marzo.pdf).
 */
export const SITE_CONFIG = {
  brandName: 'Piuma',
  tagline: 'Ropa de cama pensada para el descanso',

  /**
   * WhatsApp de Piuma (+598 91 345 454) en formato internacional, SOLO DÍGITOS. Es el único
   * lugar del front con el número: links y versión legible salen de core/whatsapp.ts, y el
   * settings.contact.whatsappNumber del API lo reemplaza cuando existe.
   */
  whatsappNumber: '59891345454',

  email: 'distrifotosrl@gmail.com',
  instagramUrl: 'https://instagram.com/piuma_uy',
  // TODO: URL inventada — el catálogo sólo menciona Instagram. Confirmar si Piuma tiene
  // Facebook; si no, sacar 'facebook' de los [networks] en contact y footer.
  facebookUrl: 'https://facebook.com/piuma',

  city: 'Barra de Carrasco, Montevideo, Uruguay',
} as const;

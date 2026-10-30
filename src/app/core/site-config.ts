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
  instagramUrl: 'https://www.instagram.com/piuma_uy/',
  /**
   * Linktree de Piuma: va en el sameAs de los datos estructurados y en llms.txt (T88). Facebook se
   * sacó del sitio: la URL era inventada y apuntaba a otra cuenta.
   */
  linktreeUrl: 'https://linktr.ee/piuma_uy',

  city: 'Barra de Carrasco, Montevideo, Uruguay',
} as const;

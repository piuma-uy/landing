/**
 * Jerarquía del catálogo: Categoría → Tipo → Variantes.
 *
 * "Tipo" y "producto" son la misma entidad: en el catálogo de Piuma cada tipo
 * ("Satén") corresponde a exactamente un producto ("Sábanas 300 hilos satén").
 * Si algún día un tipo pasa a tener más de un producto, hay que insertar un
 * nivel `products[]` entre ProductType y Variant.
 */

/**
 * Una medida concreta, con su precio y los colores disponibles PARA ESA MEDIDA.
 *
 * El precio depende sólo de la medida: las sábanas satén Queen valen lo mismo en
 * beige, gris o azul. Lo que sí cambia según la medida es qué colores existen
 * (King y Super King no vienen en azul), por eso `colors` vive acá y no en ProductType.
 */
export interface Variant {
  skuByColor?: Record<string, string>;
  priceByColor?: Record<string, number>;
  stockByColor?: Record<string, number>;
  /** Nombre de la medida: "Queen", "Super King", "50x70"… */
  size: string;
  /** Medida de la cama, ej. "160x200 cm". Ausente cuando la lista de precios no la da. */
  bedSize?: string;
  /** Medida del producto en sí, ej. "240x270 cm". */
  productSize: string;
  /** Colores disponibles en esta medida. */
  colors: string[];
  /** Precio en la moneda de ProductType.currency. */
  price: number;
  /** Peso en gramos. Sólo lo informa la marca para los acolchados. */
  weightGrams?: number;
}

/** Una foto adicional del producto, para la galería de la ficha. */
export interface Photo {
  src: string;
  alt: string;
}

export interface ProductType {
  id: string;
  /** Nombre corto, el que se ve en el nivel 2: "Satén". */
  name: string;
  /** Nombre completo para la consulta de WhatsApp: "Sábanas 300 hilos satén". */
  fullName: string;
  /** Composición textil. `null` cuando ningún PDF de la marca la especifica. */
  material: string | null;
  /** Frase corta, la que se ve en la tarjeta del nivel 2. */
  description: string;
  /**
   * Título de la descripción extendida, cuando la marca usa un nombre comercial más
   * largo que `fullName` (ej. "Sábanas 200 Hilos Percal – 100% Algodón"). Se omite
   * cuando coincidiría con el encabezado de la ficha.
   */
  longDescriptionTitle?: string;
  /** Descripción extendida de la ficha, un string por párrafo. */
  longDescription?: string[];
  /** Lista de características, se muestra debajo de la descripción extendida. */
  features?: string[];
  /** Qué incluye el juego, cuando los documentos lo aclaran. */
  includes?: string;
  currency: string;
  /** Foto principal, la que se ve en la tarjeta del nivel 2. */
  image: string;
  alt: string;
  /**
   * Foto propia por color, ej. { "Beige": "assets/…-beige.webp" }.
   * Un color SIN entrada acá es un color sin foto real: la UI muestra `image`
   * como referencia y lo aclara en pantalla. Nunca se rellena con una foto
   * de otro color haciéndola pasar por propia.
   */
  colorImages?: Record<string, string>;
  /**
   * Fotos adicionales VÁLIDAS PARA CUALQUIER COLOR (contexto, packaging neutro…).
   * Se muestran como miniaturas después de la foto principal.
   */
  gallery?: Photo[];
  /**
   * Fotos adicionales que dependen del color, ej. { "Azul": [...] }.
   * Sólo se muestran cuando ese color está seleccionado: si una foto de la textura
   * beige apareciera con "Gris" elegido, el usuario vería un color que no pidió.
   */
  galleryByColor?: Record<string, Photo[]>;
  variants: Variant[];
  /**
   * TODO pendiente de confirmar con la marca: dato incompleto o contradicción
   * entre el catálogo 2026 y la lista de precios.
   */
  _todo?: string;
}

export interface Category {
  id: string;
  name: string;
  /** Foto representativa, reutilizada de uno de sus productos. */
  image: string;
  alt: string;
  types: ProductType[];
}

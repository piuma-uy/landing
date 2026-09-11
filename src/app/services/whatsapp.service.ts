import { Injectable } from '@angular/core';
import { SITE_CONFIG } from '../core/site-config';
import { Variant } from '../models/catalog.model';

/**
 * Arma los links de wa.me. El número sale de SITE_CONFIG.whatsappNumber.
 */
@Injectable({ providedIn: 'root' })
export class WhatsappService {
  private buildLink(message: string): string {
    return `https://wa.me/${SITE_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
  }

  /** Consulta genérica, para el header, el hero y el footer. */
  generalLink(): string {
    return this.buildLink(
      `¡Hola ${SITE_CONFIG.brandName}! Quiero consultar sobre sus productos.`,
    );
  }

  /**
   * Consulta con el contexto ya elegido en el catálogo, para que la marca reciba
   * producto, color y medida sin tener que repreguntar.
   */
  variantLink(productName: string, color: string, variant: Variant): string {
    return this.buildLink(
      `¡Hola ${SITE_CONFIG.brandName}! Quiero consultar sobre ${productName}, ` +
        `color ${color.toLowerCase()}, medida ${variant.size} (${variant.productSize}). ` +
        `¿Está disponible?`,
    );
  }
}

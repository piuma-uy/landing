import { Injectable } from '@angular/core';
import { SITE_CONFIG } from '../core/site-config';

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

  /** Consulta por un producto puntual del catálogo. */
  productLink(productName: string): string {
    return this.buildLink(
      `¡Hola ${SITE_CONFIG.brandName}! Quiero consultar sobre "${productName}". ¿Está disponible?`,
    );
  }
}

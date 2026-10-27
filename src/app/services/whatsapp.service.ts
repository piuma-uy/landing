import { Injectable, computed, inject } from '@angular/core';
import { SITE_CONFIG } from '../core/site-config';
import {
  formatWhatsapp,
  generalMessage,
  preferServer,
  productMessage,
  receiptMessage,
  shippingMessage,
  shopWhatsapp,
  waLink,
} from '../core/whatsapp';
import { Variant } from '../models/catalog.model';
import type { ShippingQuote } from '../commerce/shipping';
import type { OrderTransfer } from '../commerce/transfer';
import { CommerceService } from '../commerce/commerce.service';

/**
 * Todos los links de WhatsApp de Piuma. El número es settings.contact.whatsappNumber cuando el
 * API lo mandó y, si no, SITE_CONFIG.whatsappNumber; un wa.me armado por el servidor gana.
 */
@Injectable({ providedIn: 'root' })
export class WhatsappService {
  private readonly shop = inject(CommerceService);

  /** E.164 al que van todos los links. */
  readonly number = computed(() =>
    shopWhatsapp(this.shop.settings()?.contact.whatsappNumber, SITE_CONFIG.whatsappNumber),
  );
  /** "+598 99 123 456", para mostrar en pantalla. */
  readonly display = computed(() => formatWhatsapp(this.number()));

  /** Consulta genérica, para el header, el hero, el footer y el acceso flotante. */
  readonly generalLink = computed(() =>
    waLink(this.number(), generalMessage(SITE_CONFIG.brandName)),
  );

  link(message: string): string {
    return waLink(this.number(), message);
  }

  /**
   * Consulta con el contexto ya elegido en el catálogo, para que la marca reciba
   * producto, color y medida sin tener que repreguntar.
   */
  variantLink(productName: string, color: string, variant: Variant): string {
    return this.link(
      productMessage(SITE_CONFIG.brandName, productName, color, variant.size, variant.productSize),
    );
  }

  /** Comprobante de transferencia: el link del servidor, o uno con referencia y monto. */
  receiptLink(
    order: string,
    transfer: OrderTransfer | undefined,
    amount: string,
  ): string | null {
    if (!transfer) return null;
    return (
      preferServer(
        transfer.whatsappUrl,
        this.number(),
        receiptMessage(SITE_CONFIG.brandName, order, transfer.reference, amount),
      ) || null
    );
  }

  /** Coordinar la entrega de un pedido con envío a domicilio. */
  shippingLink(reference: string, shipping: ShippingQuote | undefined): string | null {
    if (shipping?.method !== 'delivery') return null;
    return (
      this.link(
        shippingMessage(SITE_CONFIG.brandName, reference, shipping.zoneName, shipping.address),
      ) || null
    );
  }
}

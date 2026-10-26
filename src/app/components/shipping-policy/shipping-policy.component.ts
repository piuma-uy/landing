import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { CommerceService } from '../../commerce/commerce.service';
import { SITE_CONFIG } from '../../core/site-config';
import { policyDescription, policySections } from '../../core/shipping-policy';
import { WhatsappService } from '../../services/whatsapp.service';
import { WhatsappIconComponent } from '../../shared/whatsapp-icon/whatsapp-icon.component';

/** /envios/: plazo, zonas gratis, resto a coordinar y retiro (T68). Mismo texto que el prerender. */
@Component({
  selector: 'app-shipping-policy',
  standalone: true,
  imports: [WhatsappIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shipping-policy.component.html',
  styleUrl: './shipping-policy.component.scss',
})
export class ShippingPolicyComponent {
  readonly shop = inject(CommerceService);
  readonly whatsapp = inject(WhatsappService);
  readonly sections = computed(() => policySections(this.shop.policy()));
  readonly askLink = computed(() =>
    this.whatsapp.link(`¡Hola ${SITE_CONFIG.brandName}! Quiero consultar por un envío.`),
  );

  constructor() {
    this.shop.loadPolicy();
    // Abierta sin recargar: título y description propios mientras se ve, como en el prerender.
    const title = inject(Title);
    const meta = inject(Meta);
    const before = { title: title.getTitle(), description: meta.getTag('name="description"')?.content };
    title.setTitle(`Envíos y entregas | ${SITE_CONFIG.brandName}`);
    meta.updateTag({ name: 'description', content: policyDescription(this.shop.policy()) });
    inject(DestroyRef).onDestroy(() => {
      title.setTitle(before.title);
      if (before.description) meta.updateTag({ name: 'description', content: before.description });
    });
  }

  back() {
    history.back();
  }
}

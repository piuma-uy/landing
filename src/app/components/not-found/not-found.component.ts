import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommerceService } from '../../commerce/commerce.service';
import { CatalogService } from '../../services/catalog.service';
import { catalogPath } from '../../core/catalog-seo';
import { SITE_CONFIG } from '../../core/site-config';
import { WhatsappService } from '../../services/whatsapp.service';
import { WhatsappIconComponent } from '../../shared/whatsapp-icon/whatsapp-icon.component';

/**
 * 404 útil (T88): CloudFront responde 404.html con estado 404 en cualquier ruta desconocida, y la
 * app la muestra en lugar del inicio, con las categorías, los envíos y WhatsApp a mano. Se carga
 * con @defer: no suma al bundle inicial.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [WhatsappIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.scss',
})
export class NotFoundComponent {
  readonly shop = inject(CommerceService);
  private readonly whatsapp = inject(WhatsappService);
  readonly categories = toSignal(inject(CatalogService).getPrerendered(), { initialValue: [] });
  readonly catalogPath = catalogPath;
  readonly askLink = computed(() =>
    this.whatsapp.link(`¡Hola ${SITE_CONFIG.brandName}! No encontré una página en la web.`),
  );
}

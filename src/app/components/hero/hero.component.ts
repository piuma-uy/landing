import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SITE_CONFIG } from '../../core/site-config';
import { WhatsappService } from '../../services/whatsapp.service';
import { CatalogService } from '../../services/catalog.service';
import { WhatsappIconComponent } from '../../shared/whatsapp-icon/whatsapp-icon.component';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [WhatsappIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.scss',
})
export class HeroComponent {
  private readonly whatsapp = inject(WhatsappService);

  readonly config = SITE_CONFIG;
  readonly whatsappLink = this.whatsapp.generalLink;
  /** El catálogo muestra el H1 de la página: "Piuma" queda como párrafo, con el mismo aspecto. */
  readonly catalogHeading = inject(CatalogService).catalogHeading;

  readonly heroImage = 'assets/images/hero-piuma.webp';
}

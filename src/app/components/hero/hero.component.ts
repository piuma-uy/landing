import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SITE_CONFIG } from '../../core/site-config';
import { WhatsappService } from '../../services/whatsapp.service';

@Component({
  selector: 'app-hero',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.scss',
})
export class HeroComponent {
  private readonly whatsapp = inject(WhatsappService);

  readonly config = SITE_CONFIG;
  readonly whatsappLink = this.whatsapp.generalLink();

  /** Placeholder: reemplazar por assets/images/hero.jpg cuando estén las fotos reales. */
  readonly heroImage = 'https://picsum.photos/seed/piuma-hero/1200/1400';
}

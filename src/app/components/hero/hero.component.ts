import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SITE_CONFIG } from '../../core/site-config';
import { WhatsappService } from '../../services/whatsapp.service';
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

  readonly heroImage = 'assets/images/hero-piuma.webp';
}

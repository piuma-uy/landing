import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { SITE_CONFIG } from '../../core/site-config';
import { WhatsappService } from '../../services/whatsapp.service';

export type SocialNetwork = 'instagram' | 'whatsapp' | 'facebook';

@Component({
  selector: 'app-social-links',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './social-links.component.html',
  styleUrl: './social-links.component.scss',
})
export class SocialLinksComponent {
  private readonly whatsapp = inject(WhatsappService);

  @Input() networks: SocialNetwork[] = ['instagram', 'whatsapp'];

  readonly config = SITE_CONFIG;
  readonly whatsappLink = this.whatsapp.generalLink();

  has(network: SocialNetwork): boolean {
    return this.networks.includes(network);
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WhatsappService } from '../../services/whatsapp.service';
import { WhatsappIconComponent } from '../whatsapp-icon/whatsapp-icon.component';

/** Acceso fijo a WhatsApp en el teléfono, donde el menú esconde los links del header. */
@Component({
  selector: 'app-whatsapp-fab',
  standalone: true,
  imports: [WhatsappIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      class="btn btn--whatsapp whatsapp-fab"
      [href]="whatsapp.generalLink()"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribinos por WhatsApp"
    >
      <app-whatsapp-icon />
      <span class="whatsapp-fab__label">WhatsApp</span>
    </a>
  `,
  styleUrl: './whatsapp-fab.component.scss',
})
export class WhatsappFabComponent {
  readonly whatsapp = inject(WhatsappService);
}

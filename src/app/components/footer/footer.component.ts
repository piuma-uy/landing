import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SITE_CONFIG } from '../../core/site-config';
import { SocialLinksComponent } from '../../shared/social-links/social-links.component';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [SocialLinksComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent {
  readonly config = SITE_CONFIG;
  readonly year = new Date().getFullYear();

  readonly links = [
    { label: 'Inicio', fragment: 'inicio' },
    { label: 'Catálogo', fragment: 'catalogo' },
    { label: 'Sobre nosotros', fragment: 'sobre-nosotros' },
    { label: 'Contacto', fragment: 'contacto' },
  ];
}

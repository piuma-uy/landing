import { ChangeDetectionStrategy, Component, HostListener, signal } from '@angular/core';
import { SITE_CONFIG } from '../../core/site-config';
import { SocialLinksComponent } from '../../shared/social-links/social-links.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [SocialLinksComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  readonly config = SITE_CONFIG;
  readonly menuOpen = signal(false);
  readonly scrolled = signal(false);

  readonly navLinks = [
    { label: 'Catálogo', fragment: 'catalogo' },
    { label: 'Sobre nosotros', fragment: 'sobre-nosotros' },
    { label: 'Contacto', fragment: 'contacto' },
  ];

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled.set(window.scrollY > 12);
  }
}

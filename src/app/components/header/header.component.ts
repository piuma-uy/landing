import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  signal,
  inject,
} from "@angular/core";
import { CommerceService } from "../../commerce/commerce.service";
import { SITE_CONFIG } from "../../core/site-config";
import { SocialLinksComponent } from "../../shared/social-links/social-links.component";

@Component({
  selector: "app-header",
  standalone: true,
  imports: [SocialLinksComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./header.component.html",
  styleUrl: "./header.component.scss",
})
export class HeaderComponent {
  readonly shop = inject(CommerceService);
  readonly config = SITE_CONFIG;
  readonly menuOpen = signal(false);
  readonly scrolled = signal(false);

  readonly navLinks = [{ label: "Catálogo", fragment: "catalogo" }];

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  @HostListener("window:scroll")
  onScroll(): void {
    this.scrolled.set(window.scrollY > 12);
  }
}

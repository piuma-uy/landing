import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  signal,
} from "@angular/core";
import { CommerceService } from "../../commerce/commerce.service";
import { pageCostMessage } from "../../core/page-cost";
import { SITE_CONFIG } from "../../core/site-config";
import { WhatsappService } from "../../services/whatsapp.service";
import { SocialLinksComponent } from "../../shared/social-links/social-links.component";

@Component({
  selector: "app-footer",
  standalone: true,
  imports: [SocialLinksComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./footer.component.html",
  styleUrl: "./footer.component.scss",
})
export class FooterComponent {
  readonly shop = inject(CommerceService);
  readonly config = SITE_CONFIG;
  readonly whatsapp = inject(WhatsappService);
  readonly year = new Date().getFullYear();
  /** "Esta página pesó 104 kB y cargó en 0,6 s…", medido cuando el pie aparece en pantalla. */
  readonly cost = signal<string | null>(null);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly links = [
    { label: "Inicio", fragment: "inicio" },
    { label: "Catálogo", fragment: "catalogo" },
    { label: "Sobre nosotros", fragment: "sobre-nosotros" },
    { label: "Contacto", fragment: "contacto" },
  ];

  constructor() {
    // Nada en el camino crítico: se mide una sola vez, recién cuando alguien llega al pie, y así
    // también cuenta las fotos que se bajaron mientras bajaba por la página.
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof IntersectionObserver === "undefined") return;
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        this.cost.set(
          pageCostMessage(
            performance.getEntriesByType("navigation")[0] as
              | PerformanceNavigationTiming
              | undefined,
            performance.getEntriesByType(
              "resource",
            ) as PerformanceResourceTiming[],
          ),
        );
      });
      // Después del load, para que el tiempo de carga ya esté medido.
      const watch = () => observer.observe(this.host.nativeElement);
      if (document.readyState === "complete") watch();
      else addEventListener("load", watch, { once: true });
      destroyRef.onDestroy(() => {
        removeEventListener("load", watch);
        observer.disconnect();
      });
    });
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from "@angular/core";
import { Meta } from "@angular/platform-browser";
import { AnalyticsService } from "./services/analytics.service";
import { CommerceService } from "./commerce/commerce.service";
import { CommerceComponent } from "./commerce/commerce.component";
import { HeaderComponent } from "./components/header/header.component";
import { HeroComponent } from "./components/hero/hero.component";
import { CatalogComponent } from "./components/catalog/catalog.component";
import { AboutComponent } from "./components/about/about.component";
import { ContactComponent } from "./components/contact/contact.component";
import { FooterComponent } from "./components/footer/footer.component";
import { ShippingPolicyComponent } from "./components/shipping-policy/shipping-policy.component";
import { WhatsappFabComponent } from "./shared/whatsapp-fab/whatsapp-fab.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    HeaderComponent,
    CommerceComponent,
    HeroComponent,
    CatalogComponent,
    AboutComponent,
    ContactComponent,
    FooterComponent,
    ShippingPolicyComponent,
    WhatsappFabComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-header />
    <main>
      <app-commerce />
      @if (shop.shippingPage() && (!shop.enabled || shop.view() === "shop")) {
        <app-shipping-policy />
      } @else if (!shop.enabled || shop.view() === "shop") {
        <app-hero />
        <app-catalog />
        <app-about />
        <app-contact />
      }
    </main>
    <app-footer />
    @if (shop.view() !== "admin") {
      <app-whatsapp-fab />
    }
  `,
})
export class AppComponent {
  readonly shop = inject(CommerceService);
  constructor() {
    void this.shop.initialize();
    const analytics = inject(AnalyticsService);
    analytics.pageview();
    analytics.trackWhatsappClicks();
    // Cuenta, carrito, pedidos y admin se ven en la misma URL pero no son contenido indexable.
    const meta = inject(Meta);
    effect(() => {
      if (this.shop.view() === "shop") meta.removeTag('name="robots"');
      else meta.updateTag({ name: "robots", content: "noindex" });
    });
  }
}

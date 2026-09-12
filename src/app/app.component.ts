import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { CommerceService } from "./commerce/commerce.service";
import { CommerceComponent } from "./commerce/commerce.component";
import { HeaderComponent } from "./components/header/header.component";
import { HeroComponent } from "./components/hero/hero.component";
import { CatalogComponent } from "./components/catalog/catalog.component";
import { AboutComponent } from "./components/about/about.component";
import { ContactComponent } from "./components/contact/contact.component";
import { FooterComponent } from "./components/footer/footer.component";

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-header />
    <main>
      <app-commerce />
      @if (!shop.enabled || shop.view() === "shop") {
        <app-hero />
        <app-catalog />
        <app-about />
        <app-contact />
      }
    </main>
    <app-footer />
  `,
})
export class AppComponent {
  readonly shop = inject(CommerceService);
  constructor() {
    void this.shop.initialize();
  }
}

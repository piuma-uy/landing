import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CommerceService, Product } from "./commerce.service";
@Component({
  selector: "app-commerce",
  standalone: true,
  imports: [FormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./commerce.component.html",
  styleUrl: "./commerce.component.scss",
})
export class CommerceComponent {
  readonly shop = inject(CommerceService);
  readonly registering = signal(false);
  readonly adminTab = signal<"overview" | "products">("overview");
  readonly sales = computed(() =>
    this.shop.metrics().reduce((s, m) => s + m.grossSalesMinor, 0),
  );
  readonly activeCount = computed(
    () => this.shop.adminProducts().filter((p) => p.active).length,
  );
  readonly paidCount = computed(() =>
    this.shop.metrics().reduce((s, m) => s + m.paidOrders, 0),
  );
  email = "";
  password = "";
  name = "";
  contactPhone = "";
  search = "";
  editing: Product | null = null;
  price = 0;
  readonly productGroups = computed(() => {
    const groups = new Map<
      string,
      { id: string; name: string; variants: Product[]; stock: number }
    >();
    for (const p of this.shop.adminProducts()) {
      const id = `${p.categoryId}/${p.productId}`;
      let group = groups.get(id);
      if (!group) {
        group = { id, name: p.name, variants: [], stock: 0 };
        groups.set(id, group);
      }
      group.variants.push(p);
      group.stock += p.stock;
    }
    return [...groups.values()];
  });
  async submitAccount() {
    await this.shop.login(
      {
        email: this.email,
        password: this.password,
        ...(this.registering() ? { name: this.name } : {}),
      },
      this.registering(),
    );
    if (this.shop.user()) this.password = "";
  }
  edit(p: Product) {
    this.editing = { ...p };
    this.price = p.priceMinor / 100;
  }
  createProduct() {
    this.editing = {
      sku: "",
      productId: "",
      categoryId: "",
      name: "",
      size: "",
      color: "",
      description: "",
      image: "assets/images/hero-piuma.webp",
      priceMinor: 0,
      stock: 0,
      active: false,
      currency: "UYU",
      version: 0,
    };
    this.price = 0;
  }
  async save() {
    if (!this.editing) return;
    await this.shop.saveProduct({
      ...this.editing,
      priceMinor: Math.round(this.price * 100),
    });
    if (!this.shop.error()) this.editing = null;
  }
  matches(p: Product) {
    return `${p.name} ${p.sku} ${p.size} ${p.color}`
      .toLowerCase()
      .includes(this.search.toLowerCase());
  }
  readonly matchesSearch = (p: Product) => this.matches(p);
  readonly groupMatches = (group: { variants: Product[] }) =>
    group.variants.some(this.matchesSearch);
}

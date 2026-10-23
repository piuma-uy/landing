import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DomSanitizer } from "@angular/platform-browser";
import { CommerceService, Order, Product } from "./commerce.service";
import { Settings, whatsappLink } from "./transfer";
import { dateTime, reservedUntil } from "./orders";
import { MAX_UNITS } from "./cart";
import { groupSecret } from "./mfa";
import { qrPath } from "./qr";
import { changeRows, changedBy } from "./settings-history";
import {
  DEPARTMENTS,
  PICKUP_FALLBACK,
  emptyAddress,
  shippingInput,
  shippingProblem,
  shippingSummary,
  toMinor,
} from "./shipping";
@Component({
  selector: "app-commerce",
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./commerce.component.html",
  styleUrls: ["./commerce.component.scss", "./admin-security.component.scss"],
})
export class CommerceComponent {
  readonly shop = inject(CommerceService);
  readonly registering = signal(false);
  readonly adminTab = signal<
    "overview" | "products" | "transfers" | "settings"
  >("overview");
  /** Transfer row with an open confirmation step, and which action it confirms. */
  readonly reviewing = signal<{
    id: string;
    action: "confirm" | "cancel";
  } | null>(null);
  private readonly sanitizer = inject(DomSanitizer);
  /** TOTP enrollment: QR of the otpauth URL, drawn here (no image leaves the browser). */
  readonly totpQr = computed(() => {
    const t = this.shop.totp();
    return t && qrPath(t.url);
  });
  // Angular drops non-http(s) links; this one is built by mfa.ts with a fixed otpauth: scheme,
  // so the authenticator app opens on the same phone that shows the panel.
  readonly totpLink = computed(() => {
    const t = this.shop.totp();
    return t && this.sanitizer.bypassSecurityTrustUrl(t.url);
  });
  readonly totpSecret = computed(() =>
    groupSecret(this.shop.totp()?.secret ?? ""),
  );
  totpInput = "";
  readonly historyRows = computed(() =>
    this.shop.history().map((entry) => ({
      entry,
      by: changedBy(entry),
      rows: changeRows(entry),
    })),
  );
  bankReference = "";
  cancelReason = "Transferencia no recibida";
  /** Editable copy of the stored settings; replaced whenever the server sends new ones. */
  readonly draft = linkedSignal<Settings | null>(() => {
    const s = this.shop.settings();
    return s && structuredClone(s);
  });
  readonly whatsappLink = whatsappLink;
  readonly dateTime = dateTime;
  readonly reservedUntil = reservedUntil;
  readonly maxUnits = MAX_UNITS;
  readonly shippingSummary = shippingSummary;
  readonly shippingProblem = shippingProblem;
  readonly toMinor = toMinor;
  readonly departments = DEPARTMENTS;
  readonly pickupFallback = PICKUP_FALLBACK;
  /** Delivery address; sent only when the buyer picks a delivery zone. */
  address = emptyAddress();
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
  openTab(tab: "overview" | "products" | "transfers" | "settings") {
    this.adminTab.set(tab);
    this.reviewing.set(null);
  }
  async confirmTotp() {
    await this.shop.confirmTotp(this.totpInput);
    if (!this.shop.error()) this.totpInput = "";
  }
  showHistory() {
    this.openTab("settings");
    requestAnimationFrame(() =>
      document
        .getElementById("settings-history")
        ?.scrollIntoView({ behavior: "smooth" }),
    );
  }
  saveSettings() {
    // On success or 409 the service stores the server copy, which resets the draft.
    const draft = this.draft();
    if (draft)
      void this.shop.saveSettings({
        ...draft,
        shipping: shippingInput(draft.shipping),
      });
  }
  /** The API quoted this zone with the free-shipping threshold applied. */
  freeZone(zoneId: string) {
    const s = this.shop.quote()?.shipping;
    return s?.method === "delivery" && s.zoneId === zoneId && s.freeShipping;
  }
  addZone(d: Settings) {
    d.shipping.delivery.zones.push({
      id: "",
      name: "",
      priceMinor: 0,
      leadTime: "",
    });
  }
  removeZone(d: Settings, index: number) {
    d.shipping.delivery.zones.splice(index, 1);
  }
  review(order: Order, action: "confirm" | "cancel") {
    this.reviewing.set({ id: order.id, action });
    this.bankReference = "";
    this.cancelReason = "Transferencia no recibida";
  }
  async confirmTransfer(order: Order) {
    await this.shop.confirmTransfer(order, this.bankReference);
    if (!this.shop.error()) this.reviewing.set(null);
  }
  async cancelTransfer(order: Order) {
    await this.shop.cancelTransfer(order, this.cancelReason);
    if (!this.shop.error()) this.reviewing.set(null);
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

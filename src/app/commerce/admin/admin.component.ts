import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DomSanitizer } from "@angular/platform-browser";
import { CommerceService, Order, Product } from "../commerce.service";
import { dateTime } from "../orders";
import { orderCode, phoneCounts, phoneKey } from "../transfer";
import { groupSecret } from "../mfa";
import { qrPath } from "../qr";
import { AdminSettingsComponent } from "../admin-settings.component";
import { shippingSummary } from "../shipping";
import { PAID_PREVIEW, paidOrderSummary, unitsSold } from "../paid-orders";

/**
 * The administration panel: second factor, summary, products, transfers and settings.
 * Split from CommerceComponent and deferred so buyers never download it (initial budget).
 */
@Component({
  selector: "app-admin",
  standalone: true,
  imports: [FormsModule, AdminSettingsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./admin.component.html",
  styleUrls: [
    "../commerce.component.scss",
    "../admin-security.component.scss",
    "../transfers.component.scss",
    "./admin.component.scss",
  ],
})
export class AdminComponent {
  readonly shop = inject(CommerceService);
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
  bankReference = "";
  cancelReason = "Transferencia no recibida";
  readonly dateTime = dateTime;
  readonly orderCode = orderCode;
  readonly shippingSummary = shippingSummary;
  readonly sales = computed(() =>
    this.shop.metrics().reduce((s, m) => s + m.grossSalesMinor, 0),
  );
  readonly activeCount = computed(
    () => this.shop.adminProducts().filter((p) => p.active).length,
  );
  readonly paidCount = computed(() =>
    this.shop.metrics().reduce((s, m) => s + m.paidOrders, 0),
  );
  readonly unitsSold = computed(() => unitsSold(this.shop.metrics()));
  /** "Pedidos pagados" of the Resumen (T76): the API sends the newest payment first. */
  readonly allPaid = signal(false);
  readonly visiblePaid = computed(() => {
    const rows = this.shop.paidOrders() ?? [];
    return this.allPaid() ? rows : rows.slice(0, PAID_PREVIEW);
  });
  async showMorePaid() {
    if (!this.allPaid()) this.allPaid.set(true);
    else await this.shop.loadMorePaid();
  }
  readonly paidOrderSummary = paidOrderSummary;
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
    // Configuración loads on demand: wait (up to ~2 s) for the history to be on screen.
    let frames = 120;
    const scroll = () => {
      const history = document.getElementById("settings-history");
      if (history) history.scrollIntoView({ behavior: "smooth" });
      else if (--frames) requestAnimationFrame(scroll);
    };
    requestAnimationFrame(scroll);
  }
  /** "Transferencias por confirmar": the search result while there is one, else every row. */
  readonly transferRows = computed(
    () => this.shop.transferSearch()?.items ?? this.shop.pendingTransfers(),
  );
  /** Pending transfers per phone (all of them, not only the search result). */
  private readonly phoneCounts = computed(() =>
    phoneCounts(this.shop.pendingTransfers()),
  );
  samePhone(order: Order) {
    return this.phoneCounts().get(phoneKey(order.contact?.phone)) ?? 1;
  }
  transferQuery = "";
  async searchTransfers() {
    this.reviewing.set(null);
    await this.shop.searchTransfers(this.transferQuery);
  }
  clearTransferSearch() {
    this.transferQuery = "";
    this.reviewing.set(null);
    this.shop.clearTransferSearch();
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
